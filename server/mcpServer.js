import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';          // to actually instantiate an MCP server
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";     // transport channel between MCP client and server

// instantiate MCP server object
export const mcpServer = new McpServer({
    name: "qa-auditor-server",
    version: "1.0.0"
});

// Import tools
import { transcribeRecruiterAudioTool} from "./Tools/transcribe_recruiter_audio.js";
import { isolateInterviewSegmentTool } from "./Tools/isolate_interview_segment.js";
import { runComplianceAuditTool } from "./Tools/run_compliance_audit.js";
import {fetchHistoricalAuditTool} from "./Tools/fetch_historical_audit.js";

// Register tools
mcpServer.tool(
    transcribeRecruiterAudioTool.name,
    transcribeRecruiterAudioTool.description,
    transcribeRecruiterAudioTool.schema,
    transcribeRecruiterAudioTool.handler
)

mcpServer.tool(
    isolateInterviewSegmentTool.name,
    isolateInterviewSegmentTool.description,
    isolateInterviewSegmentTool.schema,
    isolateInterviewSegmentTool.handler
)

mcpServer.tool(
    runComplianceAuditTool.name,
    runComplianceAuditTool.description,
    runComplianceAuditTool.schema,
    runComplianceAuditTool.handler
)

mcpServer.tool(
    fetchHistoricalAuditTool.name,
    fetchHistoricalAuditTool.description,
    fetchHistoricalAuditTool.schema,
    fetchHistoricalAuditTool.handler
)

// Connect the server to a standard Server-Sent Event (SSE) Transport layer in @main.js