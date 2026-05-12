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
EC2 #1 (Backend) — Docling parses PDF → clean Markdown text
    ↓
EC2 #2 (GPU) — Ollama + Mistral extracts → JSON
    ↓
EC2 #1 (Backend) — Zod validation
    ↓
User reviews extracted JSON in web app (read only for now)
    ↓
User clicks "Approve and Import"
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

### EC2 #1 — Backend (always on)
- GraphQL/Prisma backend (existing, do not change)
- Node.js API
- PostgreSQL via Prisma
- Health check: `https://api.mergeplot.com/health`
- **Docling PDF parsing runs here** — Python needs to be installed on this instance
- Receives JSON back from GPU EC2 and runs Zod validation

### EC2 #2 — GPU Worker / Ollama (manual on/off)
- Instance type: `g4dn.xlarge` (1x NVIDIA T4, 4 vCPU, 16GB RAM)
- Windows Server 2022
- Runs: **Ollama + Mistral 7B only** — no Docling, no Python needed
- Node.js server on port 8000 — receives Markdown text from EC2 #1, returns extracted JSON
- Ollama has its own runtime; Node.js calls it via REST API on `localhost:11434`
- Manually started/stopped in AWS console
- Provisioned via manager's CloudFormation template

### How the two instances communicate
- Backend EC2 sends parsed Markdown text to GPU EC2 on port 8000 (private IP)
- GPU EC2 runs Mistral via Ollama, returns JSON to backend
- Port 8000 locked to backend security group only — not accessible from public internet
- GPU EC2 calls Ollama locally on `localhost:11434`

### S3
- Private bucket for PDF storage (created by CloudFormation template)
- Encrypted + versioned
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

### GPU Processing Instance / Ollama EC2 (New)
| Tech | Reason |
|---|---|
| Ollama | Self-hosted LLM runtime, no Python needed |
| Mistral 7B | Lightweight model, strong JSON extraction |
| Node.js (Express) | Thin server on port 8000 — receives Markdown, calls Ollama, returns JSON |

---

## Frontend Screens

### 1. Upload Screen
Fields:
- PDF file input
- Aircraft type selector — `PlaneType` enum (`E_2D_ADVANCED_HAWKEYE`, `E_2C_HAWKEYE`, `V_22_OSPREY`, `MQ_25_STINGRAY`, `OTHER`)
- Document type selector — `DocumentType` enum (`MAINTENANCE_REQUIREMENT_CARD`, `NAVY_IETM`, `MAINTENANCE_INSTRUCTION_MANUAL`, `ILLUSTRATED_PARTS_CATALOG`, `OTHER`)
- Organization selector — populated at runtime via `GET http://localhost:3001/organizations` (real DB data, not hardcoded)
- "Parse Procedure" button (disabled until all three dropdowns are selected)

On submit:
1. POST multipart/form-data to `http://localhost:3001/upload` with `pdf`, `planeType`, `documentType`, `organizationId`
2. API runs Docling → saves to `ProcedureSourceDocument` → triggers vector embedding via backend `ingestDocument`
3. `MAINTENANCE_REQUIREMENT_CARD` and `NAVY_IETM` types are forwarded to GPU EC2 for step extraction; all other types return markdown only
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
  "planeType": "E_2D_ADVANCED_HAWKEYE",
  "documentType": "MAINTENANCE_REQUIREMENT_CARD",
  "organizationId": "uuid-from-db",
  "uploadedBy": "user_123",
  "tailNumber": "N12345"
}
```

---

## Database Schema (PostgreSQL via Prisma)

```
ProcedureSourceDocument          ← tracks every PDF upload end-to-end
- id                             UUID, primary key
- originalFileName               PDF filename as uploaded
- filePath                       S3 key (reserved — not wired yet)
- status                         ExtractionStatus enum: PENDING → PROCESSING → COMPLETE / FAILED
- contentMarkdown                raw markdown output from docling
- planeType                      PlaneType enum (e.g. E_2D_ADVANCED_HAWKEYE)
- documentType                   DocumentType enum (e.g. MAINTENANCE_REQUIREMENT_CARD)
- tailNumber                     specific aircraft tail number (e.g. N12345)
- procedureTitle                 human-readable title
- organizationId                 FK → Organization
- uploadedById                   FK → User
- procedureId                    FK → Procedure (set after GPU extraction)
- documentId                     FK → Document (set after vector embedding)
- createdAt / updatedAt

PlaneType enum: E_2D_ADVANCED_HAWKEYE, E_2C_HAWKEYE, V_22_OSPREY, MQ_25_STINGRAY, OTHER
DocumentType enum: MAINTENANCE_INSTRUCTION_MANUAL, MAINTENANCE_REQUIREMENT_CARD,
                   ILLUSTRATED_PARTS_CATALOG, NAVY_IETM, OTHER
ExtractionStatus enum: PENDING, PROCESSING, COMPLETE, FAILED
```

---

## Pipeline Split — Docling on Backend, Ollama on GPU EC2

**EC2 #1 (Backend) — Docling step:**
```python
# parse.py — called as subprocess by Node.js backend
from docling.document_converter import DocumentConverter

converter = DocumentConverter()
result = converter.convert("path/to/file.pdf")
text = result.document.export_to_markdown()
# outputs JSON: {"markdown": "..."}
```

**EC2 #2 (GPU) — Ollama step:**
Node.js server receives the Markdown from the backend and calls Ollama locally:
```javascript
// No Python needed on GPU EC2
const response = await fetch("http://localhost:11434/api/generate", {
  method: "POST",
  body: JSON.stringify({
    model: "mistral",
    system: "...system prompt...",
    prompt: markdownText,
    stream: false
  })
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

## Spinning the GPU EC2 Up/Down

AWS Lambda is used as the **trigger switch** — it starts and stops the GPU EC2, but does not run Ollama itself (Lambda has a 15 min max runtime, Ollama needs more time to load).

```
PDF uploaded → Lambda starts GPU EC2
Processing done → Lambda stops GPU EC2
```

Ollama and Docling run on the EC2, Lambda just controls its power state.

---

### Lambda Functions

**Start Lambda (Python):**
```python
import boto3

def handler(event, context):
    ec2 = boto3.client('ec2', region_name='us-east-1')
    ec2.start_instances(InstanceIds=['i-XXXXXXXXXXXXXXXXX'])
    return {'status': 'started'}
```

**Stop Lambda (Python):**
```python
import boto3

def handler(event, context):
    ec2 = boto3.client('ec2', region_name='us-east-1')
    ec2.stop_instances(InstanceIds=['i-XXXXXXXXXXXXXXXXX'])
    return {'status': 'stopped'}
```

Note: IAM permissions for Lambda to start/stop EC2 are set up by the AWS admin (manager).

---

### Calling the Lambda Functions from Node Backend

Lambda functions are called using the AWS SDK from your Node.js backend. This is the full processing flow:

```javascript
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda'

const lambda = new LambdaClient({ region: 'us-east-1' })

// 1. Start the GPU EC2
async function startGPUInstance() {
  await lambda.send(new InvokeCommand({
    FunctionName: 'quickturn-start-gpu',  // your Lambda function name
    InvocationType: 'RequestResponse'
  }))
}

// 2. Wait for EC2 to be ready (poll every 5 seconds)
async function waitForInstanceReady(privateIp) {
  const maxAttempts = 24  // 2 minutes max
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const res = await fetch(`http://${privateIp}:8000/health`)
      if (res.ok) return true  // FastAPI is up and ready
    } catch {
      // not ready yet, wait and retry
    }
    await new Promise(r => setTimeout(r, 5000))  // wait 5 seconds
  }
  throw new Error('GPU instance did not become ready in time')
}

// 3. Send the PDF job to FastAPI
async function sendProcessingJob(privateIp, s3Path, metadata) {
  const res = await fetch(`http://${privateIp}:8000/process`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ s3Path, metadata })
  })
  return res.json()  // returns extracted JSON
}

// 4. Stop the GPU EC2
async function stopGPUInstance() {
  await lambda.send(new InvokeCommand({
    FunctionName: 'quickturn-stop-gpu',
    InvocationType: 'RequestResponse'
  }))
}

// Full orchestration — called by your GraphQL resolver
export async function processPDF(s3Path, metadata) {
  try {
    await startGPUInstance()
    await waitForInstanceReady(process.env.GPU_INSTANCE_PRIVATE_IP)
    const result = await sendProcessingJob(process.env.GPU_INSTANCE_PRIVATE_IP, s3Path, metadata)
    return result
  } finally {
    await stopGPUInstance()  // always stop, even if processing fails
  }
}
```

**Environment variables needed in Node backend:**
```
GPU_INSTANCE_PRIVATE_IP=10.0.x.x   # private IP of GPU EC2 (stable, doesn't change)
AWS_REGION=us-east-1
```

---

## CloudFormation Template (GPU EC2 — Windows)

Manager will deploy this via CloudFormation. Fills in the four parameter values at deploy time.

**Why Windows:** Manager will RDP in to manually install Ollama, pull the Mistral model, and configure the FastAPI app. No automated startup script needed.

```yaml
AWSTemplateFormatVersion: '2010-09-09'
Description: QuickTurn GPU Processing Instance (Windows)

Parameters:
  BackendSecurityGroupId:
    Type: String
    Description: Security group ID of the backend EC2 (e.g. sg-0c0902b6b546bca3f)
  SubnetId:
    Type: String
    Description: Subnet ID — must be same VPC as backend EC2
  KeyName:
    Type: String
    Description: EC2 key pair name for RDP password decryption
  AdminIP:
    Type: String
    Description: Admin IP address for RDP access (e.g. 174.175.46.180/32)

Resources:
  GPUInstance:
    Type: AWS::EC2::Instance
    Properties:

      # Hardware
      InstanceType: g4dn.xlarge        # 1x NVIDIA T4 GPU, 16GB RAM

      # OS - Windows Server 2022 with NVIDIA GPU drivers pre-installed
      # Manager should verify latest AMI ID for us-east-1 before deploying
      ImageId: ami-XXXXXXXXXXXXXXXXX   # Windows Server 2022 with NVIDIA drivers (us-east-1)

      KeyName: !Ref KeyName
      SubnetId: !Ref SubnetId

      SecurityGroupIds:
        - !Ref GPUSecurityGroup

      # Storage - 100GB for Mistral model files + OS
      BlockDeviceMappings:
        - DeviceName: /dev/sda1
          Ebs:
            VolumeSize: 100
            VolumeType: gp3

      # No UserData script needed
      # Manager will RDP in and manually install:
      # 1. Ollama (windows installer from ollama.ai)
      # 2. ollama pull mistral
      # 3. Deploy Node.js server (port 8000) — receives Markdown, calls Ollama, returns JSON
      # 4. Configure Node.js server to run as a Windows Service on startup
      # Note: No Python/Docling needed — Docling runs on EC2 #1 (backend)

  GPUSecurityGroup:
    Type: AWS::EC2::SecurityGroup
    Properties:
      GroupDescription: QuickTurn GPU Instance Security Group
      SecurityGroupIngress:

        # Node.js Ollama server - only accessible from backend EC2, not public internet
        - IpProtocol: tcp
          FromPort: 8000
          ToPort: 8000
          SourceSecurityGroupId: !Ref BackendSecurityGroupId

        # RDP - for remote desktop access, admin IP only
        - IpProtocol: tcp
          FromPort: 3389
          ToPort: 3389
          CidrIp: !Ref AdminIP

        # Port 80/443/22 NOT open - instance is private
```

**Ports open:**

| Port | Purpose | Open To |
|---|---|---|
| 8000 | FastAPI (receive jobs from backend) | Backend EC2 only |
| 3389 | RDP (remote desktop for admin) | Admin IP only |
| 80, 443, 22 | HTTP, HTTPS, SSH | NOT open |

**Placeholders manager fills in at deploy time:**

| Parameter | Value |
|---|---|
| `BackendSecurityGroupId` | Backend EC2 security group ID |
| `SubnetId` | Same subnet/VPC as backend EC2 |
| `KeyName` | Key pair name (for RDP password decryption) |
| `AdminIP` | Manager's IP address |
| `ImageId` | Correct Windows + NVIDIA AMI for us-east-1 (verify at deploy time) |

**Manual steps after first boot (via RDP):**
1. Download and install Ollama from ollama.ai
2. Run `ollama pull mistral` in command prompt
3. Deploy Node.js server (port 8000) — receives Markdown text, calls Ollama, returns JSON
4. Configure Node.js server to run as a Windows Service so it restarts automatically on boot
> No Python/Docling needed on this instance — Docling runs on EC2 #1 (backend)

---

## Security Group Configuration (Instance-to-Instance)

The GPU EC2 and backend EC2 communicate **privately within AWS** — never over the public internet.

**How it works:**
- Instead of using IP addresses (which can change), AWS security groups reference each other by ID
- The GPU EC2's inbound rule for port 8000 references the **backend's security group ID**
- AWS automatically allows any instance in that security group through — and blocks everyone else

**To find the backend security group ID:**
1. EC2 Console → Instances → click backend instance
2. Security tab
3. Copy the security group ID (e.g. `sg-0c0902b6b546bca3f`)

**Port summary for GPU EC2:**

| Port | Purpose | Open To |
|---|---|---|
| 8000 | FastAPI (receive jobs) | Backend EC2 security group only |
| 22 | SSH (debugging) | Admin IP only |
| 80/443 | HTTP/HTTPS | NOT open — not needed |

---

## Manager's CloudFormation Template — What It Does

The manager expanded the template significantly. Here's what it handles automatically vs manually.

**Automated by PowerShell startup script:**
- Creates folder structure (`C:\QuickTurn\worker`, `logs`, `models`)
- Sets environment variables (S3 bucket, GraphQL endpoint, secrets)
- Installs Chocolatey (Windows package manager)
- Installs Node.js, Git, AWS CLI, CloudWatch agent
- Downloads and installs NVIDIA GPU drivers from AWS S3
- Installs Ollama and pulls Mistral model
- Writes a basic `server.js` with `/health` and `/process` endpoints
- Starts server with PM2 (auto-restart process manager)
- Opens Windows firewall on port 8000

**Done manually via RDP after first boot:**
- Deploy actual pipeline code (replacing placeholder server.js with Ollama-calling Node.js server)
- ~~Install Python / pip install docling~~ — not needed, Docling runs on EC2 #1

**Notable additions over original template:**
- Secrets Manager — API token stored securely, not hardcoded
- S3 bucket — created by template, encrypted, versioned, fully private
- IAM role — scoped to only this bucket and secret
- CloudWatch — logging and monitoring
- Disk encrypted + won't delete if instance is terminated
- SSM Parameter for AMI — always pulls latest Windows 2022, no stale AMI IDs
- PM2 — keeps Node server running, restarts on crash
- Outputs section — InstanceId, PublicIP, health URL, S3 bucket name

---

## Open Issues to Resolve

**🔴 Priority — resolve before writing pipeline code**

**1. `updateProcessingJob` mutation doesn't exist yet**
The `server.js` calls this GraphQL mutation but it's not in the schema. Will fail until the backend team adds it.

~~**Node.js vs Python — which runs the server?**~~ ✅ Resolved — Docling runs on EC2 #1 (Python subprocess called by Node.js backend). GPU EC2 runs Ollama only via Node.js server. No Python needed on GPU EC2.

---

**🟡 Worth noting — not blockers right now**

**3. PM2 on Windows is unreliable**
PM2 is a Linux tool. Works on Windows but can be flaky. A proper Windows Service would be more stable for production. Fine for development.

**4. Ollama pull timing**
`ollama pull mistral` runs immediately after installing Ollama in the script. Ollama may not have fully started yet, causing the pull to fail silently. Check `C:\QuickTurn\logs\install.log` after first boot to verify.

**5. Backend should call private IP not public**
The template `WorkerHealthUrl` output uses the public IP. When the Node backend calls the GPU instance it should use the **private IP** to keep traffic inside AWS and avoid unnecessary exposure.

---

## Notes

- GPU EC2 is manually started/stopped via AWS console for now — Lambda automation is a future enhancement
- Editing of procedure steps is a **future state** — review screen is read only for now
- Volume is low (~100 PDFs/month) so cost is minimal (~$2-3/month new infrastructure)
- Python + Docling installed manually via RDP — not in the PowerShell startup script
