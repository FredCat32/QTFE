# QuickTurn — PDF Procedure Import Pipeline
## Project Context for Claude Code

---

## What We Are Building

A web application that allows users to upload military maintenance PDFs, parse them using AI, extract structured procedure data, review it, and import it into the QuickTurn platform for display in a Unity app.

**Full pipeline:**
```
User uploads PDF (React web app)
    ↓
PDF stored in private S3 bucket
    ↓
GPU EC2 spins up
    ↓
Docling parses PDF → clean Markdown text
    ↓
Ollama + Mistral 7B extracts → validated JSON
    ↓
GPU EC2 spins down
    ↓
User reviews extracted JSON in web app (read only for now)
    ↓
User clicks "Approve and Import"
    ↓
Zod validation (in Node backend)
    ↓
GraphQL mutation → PostgreSQL
    ↓
Unity app displays procedure
```

---

## Context & Constraints

- **Military application** — US citizen data sovereignty requirement
- **No third-party AI APIs** — all AI runs self-hosted inside our AWS account
- **AWS is approved** — we control the account, data never leaves it
- **Solo developer** — first time working with AWS

---

## Infrastructure (AWS)

### Existing EC2 (always on)
- Running the GraphQL/Prisma backend
- Node.js API
- PostgreSQL via Prisma
- Health check: `https://api.mergeplot.com/health`

### New GPU EC2 (spins up/down on demand)
- Instance type: `g4dn.xlarge` (1x NVIDIA T4, 4 vCPU, 16GB RAM)
- Runs: FastAPI + Docling + Ollama + Mistral 7B
- Only runs during PDF processing (~$1-2/month at current volume)
- **Not yet provisioned** — AWS admin will set up via CloudFormation when ready

### S3
- Private bucket for PDF storage
- PDFs uploaded via presigned URL from frontend

---

## Tech Stack

### Frontend
| Tech | Reason |
|---|---|
| Vite + React | Fast dev experience, industry standard |
| Tailwind v4 | Utility-first CSS |
| shadcn/ui | Pre-built components, works with Tailwind |
| TanStack Query | Async polling while PDF processes, loading/error states |
| React Router v7 | Simple routing for small app |
| graphql-request | Lightweight GraphQL client |

### Backend (Existing — do not change)
| Tech | Reason |
|---|---|
| GraphQL/Prisma | Already in place |
| PostgreSQL | Primary database |
| Node.js | API server |

### GPU Processing Instance (New)
| Tech | Reason |
|---|---|
| FastAPI (Python) | Receives jobs from backend, orchestrates pipeline |
| Docling | Self-hosted PDF parser, no third-party API |
| Ollama | Self-hosted LLM runtime |
| Mistral 7B | Lightweight model, strong JSON extraction |

---

## Frontend Screens

### 1. Upload Screen
Fields:
- PDF file input
- Aircraft type selector (e.g. F/A-18)
- Organization selector
- "Parse Procedure" button

On submit:
1. Upload PDF to S3 via presigned URL
2. Trigger processing job (HTTP call to FastAPI on GPU EC2)
3. Poll for status using TanStack Query
4. Navigate to review screen when done

### 2. Review Screen (read only for now)
Display:
- Procedure title
- Description
- Detected zones
- Step list (stepNumber, title, details, zone, warnings, notes, requiredTools)
- Source PDF name

Actions:
- "Approve and Import" button → calls GraphQL mutation

---

## Extracted JSON Structure

This is the exact shape Ollama must return:

```json
{
  "title": "Main Landing Gear Inspection",
  "description": "Inspect the main landing gear assembly...",
  "zones": ["731"],
  "steps": [
    {
      "stepNumber": 1,
      "title": "Open access panel",
      "details": "Open the main landing gear access panel before inspection.",
      "zone": "731",
      "warnings": [],
      "notes": [],
      "requiredTools": []
    }
  ]
}
```

---

## Ollama System Prompt

```
You are extracting maintenance procedures for QuickTurn.

Convert the following Navy procedure text into JSON.

Return only valid JSON.

Required fields:
{
  "title": string,
  "description": string,
  "zones": string[],
  "steps": [
    {
      "stepNumber": number,
      "title": string,
      "details": string,
      "zone": string | null,
      "warnings": string[],
      "notes": string[],
      "requiredTools": string[]
    }
  ]
}

Rules:
- Do not invent missing data.
- If a zone is not listed, use null.
- Preserve step order exactly.
- Keep warnings separate from normal step details.
- If a table contains step details, include them in the correct step.
```

---

## GraphQL Mutation (Already exists in backend)

```graphql
mutation ImportProcedure($input: ImportProcedureInput!) {
  importProcedure(input: $input) {
    id
    title
    stepCount
    status
  }
}
```

```graphql
input ImportProcedureInput {
  title: String!
  description: String
  aircraftType: String
  organizationId: ID!
  sourcePdfName: String
  zones: [String!]
  steps: [ProcedureStepInput!]!
}

input ProcedureStepInput {
  stepNumber: Int!
  title: String
  details: String!
  zone: String
  warnings: [String!]
  notes: [String!]
  requiredTools: [String!]
}
```

---

## Upload Metadata

```json
{
  "fileName": "navy-maintenance-procedure.pdf",
  "aircraftType": "F/A-18",
  "organizationId": "org_123",
  "uploadedBy": "user_123",
  "sourceType": "NAVY_PDF"
}
```

---

## Database Schema (PostgreSQL via Prisma)

```
Procedure
- id
- organizationId
- aircraftType
- title
- description
- sourcePdfName
- status
- createdAt

ProcedureStep
- id
- procedureId
- stepNumber
- title
- details
- zone
- warnings JSON
- notes JSON
- requiredTools JSON

ProcedureSourceDocument
- id
- procedureId
- fileName
- filePath
- parsedText
- extractedJson
- createdAt
```

---

## Python Pipeline (GPU EC2)

The GPU instance runs a FastAPI server that orchestrates:

```python
# 1. Receive job (PDF S3 path + metadata)
# 2. Download PDF from S3
# 3. Run Docling → clean markdown text
# 4. Send markdown to Ollama with system prompt → JSON
# 5. Return JSON to caller (backend)

from docling.document_converter import DocumentConverter
import requests

# Docling parse
converter = DocumentConverter()
result = converter.convert("path/to/file.pdf")
text = result.document.export_to_markdown()

# Ollama extraction
response = requests.post("http://localhost:11434/api/generate", json={
    "model": "mistral",
    "system": "...system prompt above...",
    "prompt": text,
    "stream": False
})
```

---

## Validation

Zod validation runs in the **Node backend** (not Python) before importing:
- `title` is required
- `steps` must not be empty
- Each step must have `stepNumber` and `details`
- `zones` must be strings
- `warnings` must stay separate from `details`
- Bad output → sent to review screen, not auto-imported

---

## Build Order (Milestones)

1. **Python pipeline** — FastAPI + Docling + Ollama working end to end locally
2. **React frontend** — upload screen + review screen (mock data first)
3. **S3 integration** — wire up PDF upload
4. **Connect frontend to pipeline** — real processing, polling
5. **GraphQL mutation** — approve and import
6. **AWS GPU EC2** — deploy Python pipeline (with manager, via CloudFormation)
7. **Unity** — display imported procedure

---

## How the Frontend Triggers Processing

The frontend never talks directly to the GPU EC2. The Node backend is the middleman.

**Trigger flow:**
```
User uploads PDF → S3 (presigned URL)
User clicks "Parse Procedure"
    ↓
Frontend → GraphQL mutation (startProcessing)
    ↓
Node backend → HTTP POST to FastAPI on GPU EC2
    ↓
FastAPI runs Docling + Ollama → returns JSON to Node backend
    ↓
Node backend stores result
    ↓
Frontend polls (TanStack Query) → gets result → shows review screen
```

**Node backend trigger function:**
```javascript
async function triggerProcessing(s3Path, metadata) {
  await fetch('http://gpu-ec2-private-ip:8000/process', {
    method: 'POST',
    body: JSON.stringify({ s3Path, metadata })
  })
}
```

**FastAPI endpoint on GPU EC2:**
```python
@app.post("/process")
async def process_pdf(job: JobInput):
    # 1. Download PDF from S3
    # 2. Run Docling → markdown
    # 3. Send to Ollama → JSON
    # 4. Return JSON to Node backend
```

---

## Frontend Hosting

- **During development** — run React app locally, point at AWS backend
- **Production** — serve React build files directly from existing EC2 (Option 3)
- S3 bucket remains **private**, used only for PDF storage not frontend hosting
- Access controlled via EC2 security groups

---

## Notes

- GPU EC2 not yet provisioned — AWS admin (manager) will set up when pipeline code is ready
- CloudFormation script will be AI-generated when needed
- Editing of procedure steps is a **future state** — review screen is read only for now
- Volume is low (~100 PDFs/month) so cost is minimal (~$2-3/month new infrastructure)
