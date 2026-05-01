export const MOCK_PROCEDURE = {
  title: "Main Landing Gear Inspection",
  description:
    "Inspect the main landing gear assembly for wear, damage, and proper operation per NAVAIR 01-F18AAA-2-6.2.",
  zones: ["731", "732"],
  sourcePdfName: "NAVAIR-01-F18AAA-2-6.2-MLG-Inspection.pdf",
  aircraftType: "F/A-18",
  steps: [
    {
      stepNumber: 1,
      title: "Open Access Panel",
      details:
        "Open the main landing gear access panel located on the lower fuselage. Ensure panel is fully secured in the open position using the locking mechanism.",
      zone: "731",
      warnings: ["Ensure aircraft is properly grounded before opening panel."],
      notes: ["Use panel hold-open rod P/N 12345-A if available."],
      requiredTools: ["Panel hold-open rod", "Ground strap"],
    },
    {
      stepNumber: 2,
      title: "Visual Inspection of Strut",
      details:
        "Inspect the main landing gear strut for hydraulic fluid leaks, corrosion, nicks, and scratches. Pay particular attention to the chrome strut barrel.",
      zone: "731",
      warnings: [],
      notes: [
        "Minor surface corrosion may be cleaned per applicable corrosion control manual.",
      ],
      requiredTools: ["Inspection mirror", "Flashlight"],
    },
    {
      stepNumber: 3,
      title: "Check Tire Condition",
      details:
        "Inspect tire tread depth and condition. Check for cuts, flat spots, bulges, and cord exposure. Verify tire pressure per applicable weight and balance charts.",
      zone: "731",
      warnings: ["Do not stand directly in front of or behind the tire during pressure check."],
      notes: [],
      requiredTools: ["Tire pressure gauge", "Tread depth gauge"],
    },
    {
      stepNumber: 4,
      title: "Inspect Brake Assembly",
      details:
        "Inspect brake housing for cracks, leaks, and security. Check brake wear indicators. Verify anti-skid sensor wiring harness is secure and undamaged.",
      zone: "732",
      warnings: ["Brakes may be HOT after recent flight operations. Allow adequate cooling time."],
      notes: ["Minimum brake pad thickness: 0.25 inches."],
      requiredTools: ["Torque wrench", "Caliper gauge"],
    },
    {
      stepNumber: 5,
      title: "Close and Secure Access Panel",
      details:
        "Remove all tools and equipment from the work area. Close the access panel and verify all fasteners are properly torqued.",
      zone: "731",
      warnings: [],
      notes: ["Verify panel closes flush with fuselage skin before signing off."],
      requiredTools: ["Torque wrench"],
    },
  ],
}

export const AIRCRAFT_TYPES = [
  { value: "fa18", label: "F/A-18" },
  { value: "f35", label: "F-35" },
  { value: "mh60", label: "MH-60" },
  { value: "v22", label: "V-22" },
  { value: "ch53", label: "CH-53" },
]

export const ORGANIZATIONS = [
  { value: "org_vfa_11", label: "VFA-11 Red Rippers" },
  { value: "org_vfa_31", label: "VFA-31 Tomcatters" },
  { value: "org_vfa_87", label: "VFA-87 Golden Warriors" },
  { value: "org_vmfa_121", label: "VMFA-121 Green Knights" },
]
