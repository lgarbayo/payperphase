import { chromium } from "@playwright/test";
const port = process.argv[2], out = process.argv[3];
const b = await chromium.launch({executablePath: process.env.CHROME});
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
p.on("pageerror", e => console.log("PAGEERR", e.message.slice(0,200)));
await p.goto(`http://localhost:${port}/gantt-lab?paid=1&today=2026-11-16`);
await p.waitForSelector(".b-gantt-task", { timeout: 60000 });
await p.waitForTimeout(1500);
const info = await p.evaluate(() => [...document.querySelectorAll(".b-gantt-task")].map(e => ({cls:e.className.slice(0,120), id:e.getAttribute("data-task-id"), r:e.getBoundingClientRect().toJSON()})));
console.log(JSON.stringify(info.filter(i=>/visit|ppp/.test(i.cls)).map(i=>[i.id,i.r.x|0,i.r.y|0,i.r.width|0]), null, 0));
const bars=[]; const vis = info.filter(i=>/ppp-visit/.test(i.cls)); console.log(vis.map(v=>v.cls));
console.log("bars", bars.map(i=>i.id));
// find ph2 visit
const t = vis[1];
if (!t) { await p.screenshot({path:`${out}/drag-debug.png`}); await b.close(); process.exit(1); }
const cx = t.r.x + t.r.width/2, cy = t.r.y + t.r.height/2;
// 1. illegal drag LEFT (into the healing window)
await p.mouse.move(cx, cy); await p.mouse.down();
await p.mouse.move(cx-30, cy, {steps:5}); await p.mouse.move(cx-120, cy, {steps:10});
await p.waitForTimeout(500);
await p.screenshot({ path: `${out}/06-drag-illegal-tooltip.png` });
await p.mouse.up(); await p.waitForTimeout(1200);
await p.screenshot({ path: `${out}/07-snap-back-note.png` });
// 2. legal drag RIGHT
const t2 = await p.evaluate(() => { const e=[...document.querySelectorAll(".b-gantt-task.ppp-visit")][1]; return e.getBoundingClientRect().toJSON();});
const x2 = t2.x+t2.width/2, y2=t2.y+t2.height/2;
await p.mouse.move(x2,y2); await p.mouse.down();
await p.mouse.move(x2+60,y2,{steps:8}); await p.mouse.move(x2+170,y2,{steps:10});
await p.waitForTimeout(400);
await p.screenshot({ path: `${out}/08-drag-legal-follow.png` });
await p.mouse.up(); await p.waitForTimeout(2200);
await p.screenshot({ path: `${out}/09-after-drop-cascade.png` });
await b.close();
