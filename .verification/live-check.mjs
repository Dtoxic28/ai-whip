import assert from "node:assert/strict";
for (const url of ["http://127.0.0.1:3000/", "http://127.0.0.1:3000/api/config", "http://127.0.0.1:3000/api/tasks"]) {
  const response = await fetch(url); assert.equal(response.status, 200);
  if (url.endsWith("/api/tasks")) { const data = await response.json(); assert.equal(data.tasks.length, 0); console.log("GET /api/tasks 200; 0 real tasks; no seeded records"); }
  else if (url.endsWith("/api/config")) { const data = await response.json(); assert.equal(data.realAgentConfigured, false); console.log(`GET /api/config 200; realAgentConfigured=${data.realAgentConfigured}; executionMode=${data.executionMode}`); }
  else { const html = await response.text(); assert.ok(html.includes("AI Whip")); console.log("GET / 200; production page rendered"); }
}
