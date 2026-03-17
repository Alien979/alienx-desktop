/**
 * SIGMA Detection Rules - MVP
 *
 * Simplified SIGMA-like rules for common threat detection
 * Based on popular SIGMA rules from SigmaHQ
 */

export interface SimpleSigmaRule {
  id: string;
  title: string;
  description: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  references: string[];

  // Simplified detection logic
  detection: {
    // Match by EventID (Sysmon, Windows Security, etc.)
    eventId?: number | number[];

    // Match by Provider/Source
    provider?: string | string[];

    // Match by Channel
    channel?: string | string[];

    // Field contains keywords (case-insensitive)
    contains?: {
      field: string;
      values: string[];
      operator: 'any' | 'all'; // Match any value OR all values
    }[];

    // Field equals value
    equals?: {
      field: string;
      value: string | number;
    }[];

    // Combine conditions
    logic: 'and' | 'or';
  };

  // Metadata
  author?: string;
  date?: string;
  tags?: string[];
}

/**
 * Curated list of high-value detection rules
 * Based on MITRE ATT&CK and real-world threats
 */
export const BUILTIN_RULES: SimpleSigmaRule[] = [
  // ========================================
  // CREDENTIAL ACCESS
  // ========================================
  {
    id: 'mimikatz-process-creation',
    title: 'Mimikatz Process Execution',
    description: 'Detects execution of Mimikatz credential dumping tool',
    severity: 'critical',
    references: [
      'https://attack.mitre.org/software/S0002/',
      'https://github.com/SigmaHQ/sigma/blob/master/rules/windows/process_creation/proc_creation_win_mimikatz_command_line.yml'
    ],
    detection: {
      eventId: 1, // Sysmon Process Creation
      provider: 'Microsoft-Windows-Sysmon',
      contains: [
        {
          field: 'CommandLine',
          values: ['mimikatz', 'sekurlsa', 'kerberos::ptt', 'privilege::debug'],
          operator: 'any'
        }
      ],
      logic: 'and'
    },
    author: 'Florian Roth',
    tags: ['attack.credential_access', 'attack.t1003']
  },

  {
    id: 'lsass-memory-dump',
    title: 'LSASS Memory Dump',
    description: 'Detects attempts to dump LSASS process memory for credential theft',
    severity: 'critical',
    references: [
      'https://attack.mitre.org/techniques/T1003/001/'
    ],
    detection: {
      eventId: 10, // Sysmon Process Access
      provider: 'Microsoft-Windows-Sysmon',
      contains: [
        {
          field: 'TargetImage',
          values: ['lsass.exe'],
          operator: 'any'
        }
      ],
      logic: 'and'
    },
    tags: ['attack.credential_access', 'attack.t1003.001']
  },

  // ========================================
  // EXECUTION - PowerShell
  // ========================================
  {
    id: 'powershell-download-and-execute',
    title: 'Suspicious PowerShell Download and Execute',
    description: 'Detects PowerShell downloading and executing remote code',
    severity: 'high',
    references: [
      'https://attack.mitre.org/techniques/T1059/001/'
    ],
    detection: {
      eventId: 1,
      provider: 'Microsoft-Windows-Sysmon',
      contains: [
        {
          field: 'CommandLine',
          values: ['downloadstring', 'downloadfile', 'invoke-expression', 'iex', 'bitstransfer'],
          operator: 'any'
        },
        {
          field: 'Image',
          values: ['powershell.exe', 'pwsh.exe'],
          operator: 'any'
        }
      ],
      logic: 'and'
    },
    tags: ['attack.execution', 'attack.t1059.001']
  },

  {
    id: 'powershell-encoded-command',
    title: 'Encoded PowerShell Command',
    description: 'Detects base64-encoded PowerShell commands (common obfuscation technique)',
    severity: 'medium',
    references: [
      'https://attack.mitre.org/techniques/T1027/'
    ],
    detection: {
      eventId: 1,
      provider: 'Microsoft-Windows-Sysmon',
      contains: [
        {
          field: 'CommandLine',
          values: ['-encodedcommand', '-enc', 'frombase64string'],
          operator: 'any'
        }
      ],
      logic: 'and'
    },
    tags: ['attack.defense_evasion', 'attack.t1027']
  },

  // ========================================
  // LATERAL MOVEMENT
  // ========================================
  {
    id: 'psexec-execution',
    title: 'PsExec Service Execution',
    description: 'Detects PsExec being used for lateral movement',
    severity: 'high',
    references: [
      'https://attack.mitre.org/techniques/T1021/002/'
    ],
    detection: {
      eventId: 1,
      provider: 'Microsoft-Windows-Sysmon',
      contains: [
        {
          field: 'CommandLine',
          values: ['psexec', 'paexec', 'accepteula'],
          operator: 'any'
        }
      ],
      logic: 'and'
    },
    tags: ['attack.lateral_movement', 'attack.t1021.002']
  },

  // ========================================
  // PERSISTENCE
  // ========================================
  {
    id: 'registry-run-key-modification',
    title: 'Registry Run Key Modification',
    description: 'Detects modifications to registry run keys for persistence',
    severity: 'medium',
    references: [
      'https://attack.mitre.org/techniques/T1547/001/'
    ],
    detection: {
      eventId: [12, 13], // Sysmon Registry events
      provider: 'Microsoft-Windows-Sysmon',
      contains: [
        {
          field: 'TargetObject',
          values: ['\\CurrentVersion\\Run', '\\CurrentVersion\\RunOnce'],
          operator: 'any'
        }
      ],
      logic: 'and'
    },
    tags: ['attack.persistence', 'attack.t1547.001']
  },

  // ========================================
  // DEFENSE EVASION
  // ========================================
  {
    id: 'sysmon-unload',
    title: 'Sysmon Driver Unload',
    description: 'Detects attempts to unload Sysmon driver to evade detection',
    severity: 'critical',
    references: [
      'https://attack.mitre.org/techniques/T1562/001/'
    ],
    detection: {
      eventId: 255, // Sysmon Error
      provider: 'Microsoft-Windows-Sysmon',
      logic: 'and'
    },
    tags: ['attack.defense_evasion', 'attack.t1562.001']
  },

  {
    id: 'disable-windows-defender',
    title: 'Windows Defender Disabled',
    description: 'Detects attempts to disable Windows Defender',
    severity: 'high',
    references: [
      'https://attack.mitre.org/techniques/T1562/001/'
    ],
    detection: {
      eventId: 1,
      provider: 'Microsoft-Windows-Sysmon',
      contains: [
        {
          field: 'CommandLine',
          values: [
            'Set-MpPreference -DisableRealtimeMonitoring',
            'Set-MpPreference -DisableBehaviorMonitoring',
            'DisableAntiSpyware'
          ],
          operator: 'any'
        }
      ],
      logic: 'and'
    },
    tags: ['attack.defense_evasion', 'attack.t1562.001']
  },

  // ========================================
  // DISCOVERY
  // ========================================
  {
    id: 'network-reconnaissance',
    title: 'Network Reconnaissance Commands',
    description: 'Detects network scanning and enumeration commands',
    severity: 'medium',
    references: [
      'https://attack.mitre.org/techniques/T1018/'
    ],
    detection: {
      eventId: 1,
      provider: 'Microsoft-Windows-Sysmon',
      contains: [
        {
          field: 'Image',
          values: ['nmap', 'netscan', 'ipscan'],
          operator: 'any'
        }
      ],
      logic: 'or'
    },
    tags: ['attack.discovery', 'attack.t1018']
  },

  // ========================================
  // COMMAND AND CONTROL
  // ========================================
  {
    id: 'cobalt-strike-named-pipe',
    title: 'Cobalt Strike Named Pipe',
    description: 'Detects default Cobalt Strike named pipes',
    severity: 'critical',
    references: [
      'https://attack.mitre.org/software/S0154/'
    ],
    detection: {
      eventId: [17, 18], // Sysmon Pipe events
      provider: 'Microsoft-Windows-Sysmon',
      contains: [
        {
          field: 'PipeName',
          values: ['\\msagent_', '\\postex_', '\\status_', '\\MSSE-'],
          operator: 'any'
        }
      ],
      logic: 'and'
    },
    tags: ['attack.command_and_control', 'attack.t1071']
  }
];

/**
 * Get severity color for UI display
 * Using muted, professional colors that are easier on the eyes
 */
export function getSeverityColor(severity: string): string {
  switch (severity) {
    case 'critical': return '#f87171'; // soft coral red
    case 'high': return '#fb923c'; // soft orange
    case 'medium': return '#fbbf24'; // warm amber
    case 'low': return '#4ade80'; // soft mint green
    case 'info':
    case 'informational': return '#60a5fa'; // soft blue
    default: return '#60a5fa'; // default to blue for unknown
  }
}

/**
 * Get severity icon for UI display
 */
export function getSeverityIcon(severity: string): string {
  switch (severity) {
    case 'critical': return '🔴';
    case 'high': return '🟠';
    case 'medium': return '🟡';
    case 'low': return '🟢';
    case 'info':
    case 'informational': return '🔵';
    default: return '🔵';
  }
}
