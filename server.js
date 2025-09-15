
// server.js – RAG-backend för er chatt
import "dotenv/config";
import fs from "fs";
import path from "path";
import express from "express";
import cors from "cors";
import OpenAI from "openai";
import { JSDOM } from "jsdom";
import { htmlToText } from "html-to-text";

const PORT = process.env.PORT || 3001;
// Här ligger era .html (din rotmapp)
const SITE_DIR = path.resolve("./");

// Justera om din kontakt-sida heter något annat (t.ex. "bokning.html")
const CONTACT_URL = "/kontakt.html";    // byt till "/bokning.html" om du inte har kontakt.html
const ACUTE_PHONE_HUMAN = "042-26 00 44";
const OPENING_TEXT = "Våra ordinarie öppettider är mån–fre 09:00–18:00.";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const app = express();
app.use(cors());
app.use(express.json());

// --------- Hjälpfunktioner ---------
function chunkText(s, max = 1400) {
  const out = [];
  let t = s.trim().replace(/\s+/g, " ");
  while (t.length) { out.push(t.slice(0, max)); t = t.slice(max); }
  return out;
}
const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0);
const norm=a=>Math.sqrt(dot(a,a));
const cos=(a,b)=>dot(a,b)/(norm(a)*norm(b));

// --------- 1) Indexera webben vid start ---------
const rows = []; // {id,url,title,text,embedding}

async function indexSite() {
  const ignore = ["header.html","footer.html","chatbot.html"];
  const files = fs.readdirSync(SITE_DIR)
    .filter(f => f.endsWith(".html") && !ignore.includes(f));

  let count = 0;
  for (const file of files) {
    const html = fs.readFileSync(path.join(SITE_DIR, file), "utf8");
    const dom = new JSDOM(html);
    dom.window.document.querySelectorAll("nav, header, footer, script, style").forEach(el => el.remove());
    const text = htmlToText(dom.serialize(), { wordwrap:false, selectors:[{selector:"a", options:{ignoreHref:true}}] });
    const parts = chunkText(text);

    for (let i=0;i<parts.length;i++) {
      const emb = await client.embeddings.create({ model:"text-embedding-3-small", input: parts[i] });
      rows.push({
        id: `${file}#${i}`,
        url: `/${file}`,
        title: file.replace(".html",""),
        text: parts[i],
        embedding: emb.data[0].embedding
      });
      count++;
    }
  }
  console.log(`✅ Indexerat ${count} textbitar från ${files.length} sidor.`);
}

async function retrieve(query, k=6) {
  const q = (await client.embeddings.create({ model:"text-embedding-3-small", input: query })).data[0].embedding;
  return rows.map(r => ({...r, score: cos(q, r.embedding)}))
             .sort((a,b)=>b.score-a.score)
             .slice(0,k);
}

// --------- 2) Chat-endpoint ---------
app.post("/api/chat", async (req,res) => {
  try {
    const { message } = req.body;
    if (!message) return res.status(400).json({ error:"message saknas" });

    const hits = await retrieve(message, 6);
    const strong = hits.filter(h => h.score >= 0.22);   // enkel tröskel

    const system = `
Du är Tandläkarklinikens assistent. Svara varmt och tydligt på SVENSKA i VI-form.
Använd ENDAST innehållet i "KÄLLOR". Gissa inte.
Om info saknas eller ligger utanför våra sidor:
- Säg: "Det har vi tyvärr inte information om på sidan ännu."
- Hänvisa till vårt formulär ${CONTACT_URL} (vi svarar inom 24 timmar).
- Vid akuta besvär: ring ${ACUTE_PHONE_HUMAN}. ${OPENING_TEXT}
Avsluta alltid med nästa steg (t.ex. "Boka tid" eller "Kontakta oss").
Inga diagnoser eller personuppgifter.
`;

    // Fallback om vi inte hittar något vettigt
    if (strong.length === 0) {
      return res.json({
        answer: `Det har vi tyvärr inte information om på sidan ännu.
Du kan fylla i formuläret här: ${CONTACT_URL} så återkommer vi inom 24 timmar.
Vid akuta besvär: ring ${ACUTE_PHONE_HUMAN}. ${OPENING_TEXT}
Nästa steg: beskriv ditt ärende kort så hjälper vi dig vidare.`,
        sources: []
      });
    }

    const sourcesText = strong.map((r,i)=>`[${i+1}] (${r.url}) ${r.text}`).join("\n\n");
    const user = `FRÅGA: ${message}\n\nKÄLLOR:\n${sourcesText}`;

    const resp = await client.responses.create({
      model: "gpt-5.1-mini",
      input: [
        { role: "system", content: system },
        { role: "user", content: user }
      ]
    });

    const answer = resp.output_text;
    const cites = strong.map((r,i)=>({ label:`[${i+1}]`, url:r.url, title:r.title }));
    res.json({ answer, sources: cites });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error:"server_error" });
  }
});

// --------- Start ---------
indexSite().then(()=>{
  app.listen(PORT, ()=>console.log(`🚀 Chat-backend kör: http://localhost:${PORT}`));
});
