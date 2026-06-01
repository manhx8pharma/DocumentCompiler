FlowForge API Documentation
Overview
FlowForge provides a RESTful API for managing workflows, field mappings, workflow runs, and more. All API endpoints are prefixed with /api.

Base URL: https://your-domain.com/api

Content-Type: application/json

Table of Contents
Authentication
Error Handling
Dashboard API
Workflows API
Workflow Steps API
Step Connections API
Field Definitions API
Field Mappings API
Workflow Runs API
Workflow Versions API
Audit Logs API
Templates API
Schedules API
Testing API
Transformations API
WebSocket API
Authentication
Currently, the API does not require authentication. In production, implement appropriate authentication mechanisms (JWT, API Keys, etc.).

Error Handling
Error Response Format
{
  "error": "Error message description",
  "details": [
    {
      "code": "error_code",
      "message": "Detailed error message",
      "path": ["field_name"]
    }
  ]
}

HTTP Status Codes
Code	Description
200	Success
201	Created
204	No Content (successful delete)
400	Bad Request (validation error)
404	Not Found
500	Internal Server Error
Dashboard API
Get Dashboard Stats
Returns summary statistics for the dashboard.

Endpoint: GET /api/dashboard/stats

Response:

{
  "totalWorkflows": 6,
  "activeWorkflows": 4,
  "totalMappings": 12,
  "recentRuns": 5
}

Workflows API
List All Workflows
Endpoint: GET /api/workflows

Response:

[
  {
    "id": "uuid-string",
    "name": "Customer Data Sync",
    "description": "Synchronize customer data between systems",
    "status": "active",
    "version": 1,
    "createdBy": null,
    "createdAt": "2024-12-09T05:22:13.048Z",
    "updatedAt": "2024-12-09T05:22:13.048Z"
  }
]

Get Single Workflow
Endpoint: GET /api/workflows/:id

Parameters:

Name	Type	Description
id	string	Workflow ID
Response:

{
  "workflow": {
    "id": "uuid-string",
    "name": "Customer Data Sync",
    "description": "Synchronize customer data between systems",
    "status": "active",
    "version": 1,
    "createdAt": "2024-12-09T05:22:13.048Z",
    "updatedAt": "2024-12-09T05:22:13.048Z"
  },
  "steps": [
    {
      "id": "step-uuid",
      "workflowId": "uuid-string",
      "name": "Fetch Data",
      "type": "source",
      "order": 1,
      "positionX": 100,
      "positionY": 100,
      "config": {}
    }
  ]
}

Create Workflow
Endpoint: POST /api/workflows

Request Body:

{
  "name": "New Workflow",
  "description": "Description of the workflow",
  "status": "draft",
  "version": 1
}

Response: 201 Created

{
  "id": "new-uuid-string",
  "name": "New Workflow",
  "description": "Description of the workflow",
  "status": "draft",
  "version": 1,
  "createdAt": "2024-12-09T10:00:00.000Z",
  "updatedAt": "2024-12-09T10:00:00.000Z"
}

Update Workflow
Endpoint: PATCH /api/workflows/:id

Request Body:

{
  "name": "Updated Name",
  "status": "active"
}

Response:

{
  "id": "uuid-string",
  "name": "Updated Name",
  "status": "active",
  ...
}

Delete Workflow
Endpoint: DELETE /api/workflows/:id

Response: 204 No Content

Workflow Steps API
Get Steps for Workflow
Endpoint: GET /api/workflows/:workflowId/steps

Response:

[
  {
    "id": "step-uuid",
    "workflowId": "workflow-uuid",
    "name": "Fetch Data",
    "type": "source",
    "order": 1,
    "positionX": 100,
    "positionY": 100,
    "config": {}
  }
]

Create Step
Endpoint: POST /api/workflows/:workflowId/steps

Request Body:

{
  "name": "Process Data",
  "type": "process",
  "order": 2,
  "positionX": 300,
  "positionY": 100,
  "config": {}
}

Response: 201 Created

Update Step
Endpoint: PATCH /api/steps/:id

Request Body:

{
  "name": "Updated Step Name",
  "positionX": 150,
  "positionY": 200
}

Delete Step
Endpoint: DELETE /api/steps/:id

Response: 204 No Content

Step Connections API
Get Connections for Workflow
Endpoint: GET /api/workflows/:workflowId/connections

Response:

[
  {
    "id": "connection-uuid",
    "workflowId": "workflow-uuid",
    "sourceStepId": "step-1-uuid",
    "targetStepId": "step-2-uuid",
    "condition": null,
    "label": "Success"
  }
]

Create Connection
Endpoint: POST /api/workflows/:workflowId/connections

Request Body:

{
  "sourceStepId": "step-1-uuid",
  "targetStepId": "step-2-uuid",
  "condition": null,
  "label": "Success"
}

Delete Connection
Endpoint: DELETE /api/connections/:id

Response: 204 No Content

Field Definitions API
List Field Definitions
Endpoint: GET /api/fields

Query Parameters:

Name	Type	Description
source	string	Filter by source type ("source" or "target")
Response:

[
  {
    "id": "field-uuid",
    "name": "first_name",
    "type": "text",
    "source": "source",
    "description": "Customer first name"
  }
]

Create Field Definition
Endpoint: POST /api/fields

Request Body:

{
  "name": "new_field",
  "type": "text",
  "source": "source",
  "description": "Field description"
}

Delete Field Definition
Endpoint: DELETE /api/fields/:id

Response: 204 No Content

Field Mappings API
List Field Mappings
Endpoint: GET /api/mappings

Query Parameters:

Name	Type	Description
workflowId	string	Filter by workflow ID
Response:

[
  {
    "id": "mapping-uuid",
    "workflowId": "workflow-uuid",
    "sourceFieldId": "source-field-uuid",
    "targetFieldId": "target-field-uuid",
    "transformationRule": "uppercase(input)",
    "confidenceScore": 1,
    "isAutoMapped": false,
    "isBidirectional": false
  }
]

Create Field Mapping
Endpoint: POST /api/mappings

Request Body:

{
  "workflowId": "workflow-uuid",
  "sourceFieldId": "source-field-uuid",
  "targetFieldId": "target-field-uuid",
  "transformationRule": null,
  "confidenceScore": 1,
  "isAutoMapped": false,
  "isBidirectional": false
}

Update Field Mapping
Endpoint: PATCH /api/mappings/:id

Request Body:

{
  "transformationRule": "uppercase(input)"
}

Delete Field Mapping
Endpoint: DELETE /api/mappings/:id

Response: 204 No Content

Auto-Map Fields
Automatically create mappings based on field name similarity.

Endpoint: POST /api/mappings/auto-map

Request Body:

{
  "workflowId": "workflow-uuid",
  "threshold": 0.7
}

Response:

{
  "mappingsCreated": 5,
  "mappings": [...]
}

Workflow Runs API
List Workflow Runs
Endpoint: GET /api/runs

Query Parameters:

Name	Type	Description
workflowId	string	Filter by workflow ID
Response:

[
  {
    "id": "run-uuid",
    "workflowId": "workflow-uuid",
    "status": "completed",
    "startedAt": "2024-12-09T10:00:00.000Z",
    "completedAt": "2024-12-09T10:00:30.000Z",
    "inputData": {},
    "outputData": {},
    "errorMessage": null
  }
]

Get Single Run
Endpoint: GET /api/runs/:id

Response:

{
  "run": {
    "id": "run-uuid",
    "workflowId": "workflow-uuid",
    "status": "completed",
    ...
  },
  "stepValues": [
    {
      "id": "step-value-uuid",
      "runId": "run-uuid",
      "stepId": "step-uuid",
      "inputData": {},
      "outputData": {},
      "status": "completed"
    }
  ]
}

Create Workflow Run
Endpoint: POST /api/runs

Request Body:

{
  "workflowId": "workflow-uuid",
  "status": "running",
  "inputData": {
    "key": "value"
  }
}

Workflow Versions API
Get Version History
Endpoint: GET /api/workflows/:workflowId/versions

Response:

[
  {
    "id": "version-uuid",
    "workflowId": "workflow-uuid",
    "versionNumber": 2,
    "name": "Customer Data Sync",
    "description": "Updated description",
    "status": "active",
    "stepsSnapshot": [...],
    "connectionsSnapshot": [...],
    "mappingsSnapshot": [...],
    "changeNotes": "Added validation step",
    "createdAt": "2024-12-09T12:00:00.000Z",
    "createdBy": null
  }
]

Get Specific Version
Endpoint: GET /api/versions/:id

Response:

{
  "id": "version-uuid",
  "workflowId": "workflow-uuid",
  "versionNumber": 2,
  "stepsSnapshot": [...],
  "connectionsSnapshot": [...],
  "mappingsSnapshot": [...],
  ...
}

Save New Version
Create a snapshot of the current workflow state.

Endpoint: POST /api/workflows/:workflowId/versions

Request Body:

{
  "changeNotes": "Added email validation step"
}

Response: 201 Created

Rollback to Version
Restore workflow to a previous version.

Endpoint: POST /api/workflows/:workflowId/rollback/:versionId

Response:

{
  "success": true,
  "message": "Workflow rolled back to version 1",
  "workflow": {...}
}

Compare Versions
Endpoint: GET /api/workflows/:workflowId/versions/compare?v1=:version1Id&v2=:version2Id

Response:

{
  "version1": {...},
  "version2": {...},
  "differences": {
    "steps": {
      "added": [...],
      "removed": [...],
      "modified": [...]
    },
    "connections": {...},
    "mappings": {...}
  }
}

Audit Logs API
Get Audit Logs
Endpoint: GET /api/audit-logs

Query Parameters:

Name	Type	Default	Description
limit	number	50	Maximum number of logs to return
Response:

[
  {
    "id": "log-uuid",
    "entityType": "workflow",
    "entityId": "workflow-uuid",
    "action": "create",
    "userId": null,
    "previousValues": null,
    "newValues": {
      "name": "New Workflow",
      "status": "draft"
    },
    "timestamp": "2024-12-09T10:00:00.000Z",
    "ipAddress": null
  }
]

Templates API
List Templates
Endpoint: GET /api/templates

Response:

[
  {
    "id": "template-uuid",
    "externalId": "tmpl_001",
    "name": "Invoice Template",
    "fields": [
      {
        "name": "invoice_number",
        "type": "text",
        "required": true
      },
      {
        "name": "amount",
        "type": "number",
        "required": true
      }
    ],
    "lastSyncedAt": "2024-12-09T10:00:00.000Z"
  }
]

Get Single Template
Endpoint: GET /api/templates/:id

Sync Templates from DocCompile
Fetch and update templates from external DocCompile service.

Endpoint: POST /api/templates/sync

Response:

{
  "synced": 3,
  "templates": [...]
}

Schedules API
List Schedules
Endpoint: GET /api/schedules

Response:

[
  {
    "id": "schedule-uuid",
    "workflowId": "workflow-uuid",
    "name": "Daily Sync",
    "cronExpression": "0 0 * * *",
    "isEnabled": true,
    "lastRunAt": "2024-12-09T00:00:00.000Z",
    "nextRunAt": "2024-12-10T00:00:00.000Z",
    "createdAt": "2024-12-01T10:00:00.000Z"
  }
]

Create Schedule
Endpoint: POST /api/schedules

Request Body:

{
  "workflowId": "workflow-uuid",
  "name": "Hourly Sync",
  "cronExpression": "0 * * * *",
  "isEnabled": true
}

Update Schedule
Endpoint: PATCH /api/schedules/:id

Request Body:

{
  "isEnabled": false
}

Delete Schedule
Endpoint: DELETE /api/schedules/:id

Response: 204 No Content

Testing API
Run Workflow Test
Execute a workflow with mock data for testing.

Endpoint: POST /api/test-runs

Request Body:

{
  "workflowId": "workflow-uuid",
  "name": "Test Run 1",
  "mockData": {
    "first_name": "John",
    "last_name": "Doe",
    "email": "john@example.com"
  }
}

Response:

{
  "id": "test-run-uuid",
  "workflowId": "workflow-uuid",
  "name": "Test Run 1",
  "status": "passed",
  "mockData": {...},
  "results": [
    {
      "fieldName": "firstName",
      "inputValue": "John",
      "outputValue": "JOHN",
      "status": "passed",
      "message": null
    }
  ],
  "executedAt": "2024-12-09T10:00:00.000Z"
}

Get Test Runs
Endpoint: GET /api/test-runs

Query Parameters:

Name	Type	Description
workflowId	string	Filter by workflow ID
Get Test Run Details
Endpoint: GET /api/test-runs/:id

Transformations API
List Available Transformations
Get all built-in transformation functions.

Endpoint: GET /api/transformations

Response:

{
  "categories": [
    {
      "name": "Text",
      "functions": [
        {
          "name": "uppercase",
          "description": "Convert text to uppercase",
          "syntax": "uppercase(input)",
          "example": "uppercase('hello') → 'HELLO'"
        },
        {
          "name": "lowercase",
          "description": "Convert text to lowercase",
          "syntax": "lowercase(input)",
          "example": "lowercase('HELLO') → 'hello'"
        },
        {
          "name": "trim",
          "description": "Remove leading and trailing whitespace",
          "syntax": "trim(input)",
          "example": "trim('  hello  ') → 'hello'"
        },
        {
          "name": "concat",
          "description": "Concatenate multiple values",
          "syntax": "concat(value1, value2, ...)",
          "example": "concat('Hello', ' ', 'World') → 'Hello World'"
        }
      ]
    },
    {
      "name": "Date",
      "functions": [
        {
          "name": "formatDate",
          "description": "Format date to specified pattern",
          "syntax": "formatDate(input, pattern)",
          "example": "formatDate('2024-01-15', 'DD/MM/YYYY') → '15/01/2024'"
        },
        {
          "name": "parseDate",
          "description": "Parse date string to Date object",
          "syntax": "parseDate(input, format)",
          "example": "parseDate('15/01/2024', 'DD/MM/YYYY')"
        }
      ]
    },
    {
      "name": "Number",
      "functions": [
        {
          "name": "round",
          "description": "Round number to specified decimals",
          "syntax": "round(input, decimals)",
          "example": "round(3.14159, 2) → 3.14"
        },
        {
          "name": "formatNumber",
          "description": "Format number with locale",
          "syntax": "formatNumber(input, locale)",
          "example": "formatNumber(1234567.89, 'vi-VN') → '1.234.567,89'"
        }
      ]
    }
  ]
}

Preview Transformation
Test a transformation without saving.

Endpoint: POST /api/transformations/preview

Request Body:

{
  "expression": "uppercase(input)",
  "inputValue": "hello world"
}

Response:

{
  "success": true,
  "result": "HELLO WORLD",
  "error": null
}

WebSocket API
FlowForge provides real-time collaboration features via WebSocket.

Connection
Endpoint: wss://your-domain.com/ws/collaboration

Message Types
Join Workflow Session
{
  "type": "join",
  "workflowId": "workflow-uuid",
  "userId": "user-id"
}

Leave Session
{
  "type": "leave",
  "workflowId": "workflow-uuid"
}

Cursor Position Update
{
  "type": "cursor",
  "workflowId": "workflow-uuid",
  "position": {
    "x": 150,
    "y": 200
  }
}

Step Update (Broadcast)
{
  "type": "step_update",
  "workflowId": "workflow-uuid",
  "step": {
    "id": "step-uuid",
    "positionX": 150,
    "positionY": 200
  }
}

Server Events
Presence Update
{
  "type": "presence",
  "users": [
    {
      "id": "user-id",
      "name": "User Name",
      "cursor": {"x": 100, "y": 200}
    }
  ]
}

Conflict Notification
{
  "type": "conflict",
  "message": "Another user modified this step",
  "stepId": "step-uuid"
}

Export API
Export Mappings
Export field mappings to JSON format.

Endpoint: GET /api/export/mappings

Query Parameters:

Name	Type	Default	Description
format	string	json	Export format (currently only json)
workflowId	string	-	Filter by workflow ID
Response Headers:

Content-Type: application/json
Content-Disposition: attachment; filename=mappings.json

Utility Endpoints
Seed Demo Data
Populate the database with sample data for testing.

Endpoint: POST /api/seed

Response:

{
  "success": true,
  "message": "Seed data created"
}

Rate Limiting
Currently, no rate limiting is implemented. For production use, implement appropriate rate limiting based on your requirements.

Data Types
Workflow Status
Value	Description
draft	Work in progress
active	Currently active
archived	No longer in use
Step Types
Value	Description
source	Data source/input
process	Data processing
target	Data destination
decision	Conditional branching
Field Types
Value	Description
text	Text/string data
number	Numeric data
date	Date values
email	Email addresses
phone	Phone numbers
boolean	True/false values
address	Physical addresses
Run Status
Value	Description
pending	Not yet started
running	Currently executing
completed	Successfully finished
failed	Execution failed
Integration Examples
JavaScript/Node.js
const API_BASE = 'https://your-domain.com/api';
// Get all workflows
async function getWorkflows() {
  const response = await fetch(`${API_BASE}/workflows`);
  return response.json();
}
// Create a workflow
async function createWorkflow(data) {
  const response = await fetch(`${API_BASE}/workflows`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(data)
  });
  return response.json();
}
// Run a test
async function runTest(workflowId, mockData) {
  const response = await fetch(`${API_BASE}/test-runs`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      workflowId,
      name: 'API Test',
      mockData
    })
  });
  return response.json();
}

Python
import requests
API_BASE = 'https://your-domain.com/api'
# Get all workflows
def get_workflows():
    response = requests.get(f'{API_BASE}/workflows')
    return response.json()
# Create a workflow
def create_workflow(name, description):
    response = requests.post(
        f'{API_BASE}/workflows',
        json={
            'name': name,
            'description': description,
            'status': 'draft',
            'version': 1
        }
    )
    return response.json()
# Sync templates
def sync_templates():
    response = requests.post(f'{API_BASE}/templates/sync')
    return response.json()

cURL Examples
# Get all workflows
curl -X GET "https://your-domain.com/api/workflows"
# Create a workflow
curl -X POST "https://your-domain.com/api/workflows" \
  -H "Content-Type: application/json" \
  -d '{"name":"My Workflow","description":"Test","status":"draft","version":1}'
# Get dashboard stats
curl -X GET "https://your-domain.com/api/dashboard/stats"
# Sync templates
curl -X POST "https://your-domain.com/api/templates/sync"
# Auto-map fields
curl -X POST "https://your-domain.com/api/mappings/auto-map" \
  -H "Content-Type: application/json" \
  -d '{"workflowId":"your-workflow-id","threshold":0.7}'

API Version: 1.0
Last Updated: December 2024