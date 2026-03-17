export interface ThreatHuntPlaybook {
  id: string;
  name: string;
  description: string;
  sigmaTagKeywords: string[];
  suggestedQuery: string;
}

export const THREAT_HUNT_PLAYBOOKS: ThreatHuntPlaybook[] = [
  {
    id: "lateral-movement",
    name: "Hunt: Lateral Movement",
    description:
      "Highlights remote execution, service abuse, and lateral movement rule matches.",
    sigmaTagKeywords: ["lateral", "psexec", "wmi", "remote", "t1021"],
    suggestedQuery: "psexec|wmic|winrm|\\\\",
  },
  {
    id: "credential-dumping",
    name: "Hunt: Credential Dumping",
    description:
      "Focuses on LSASS access, SAM extraction, and credential-access behaviors.",
    sigmaTagKeywords: ["credential", "lsass", "sam", "dump", "t1003"],
    suggestedQuery: "lsass|sekurlsa|sam|mimikatz",
  },
  {
    id: "persistence",
    name: "Hunt: Persistence",
    description:
      "Targets startup, run keys, scheduled tasks, services, and autorun persistence.",
    sigmaTagKeywords: [
      "persistence",
      "runkey",
      "scheduled",
      "autorun",
      "t1547",
    ],
    suggestedQuery: "run\\\\|schtasks|startup|service",
  },
];
