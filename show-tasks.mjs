const r = await fetch('http://localhost:8787/api/tasks');
for (const t of await r.json()) console.log(t.id, t.reward, t.currency, (t.deadline||'').slice(0,16), t.status, '|', t.title.slice(0,60));
