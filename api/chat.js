import { GoogleGenerativeAI } from "@google/generative-ai";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const KNOWLEDGE_FILE = path.join(__dirname, "..", "knowledge", "faq.json");

const BASE_SYSTEM_PROMPT = `
Você é o Assistente Virtual do Instituto Abraçar de Apoio aos Portadores de Câncer.

Seu papel é acolher visitantes com empatia, responder dúvidas institucionais com clareza e segurança, e jamais substituir orientação médica.

Regras:
- Não fazer diagnósticos
- Não interpretar exames
- Não recomendar medicamentos
- Não inventar informações
- Em urgência, orientar busca imediata por atendimento médico

Informações institucionais:
- O Instituto Abraçar oferece acolhimento e esperança para quem enfrenta o câncer.
- Oferece suporte integral, acompanhamento e esperança para pacientes com câncer e suas famílias.
- É uma organização dedicada ao acolhimento integral.
- Ninguém deve enfrentar essa jornada sozinho.
- Valores: acolhimento humanizado, suporte integral, esperança e fé.
`;

const allowedOrigins = (process.env.ALLOWED_ORIGINS || "https://iaapc.org.br,http://localhost:3000")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

let knowledgeCache;
let geminiClient;

function getApiKey() {
  return process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || process.env.OPENAI_API_KEY || null;
}

function getClient() {
  const apiKey = getApiKey();

  if (!apiKey) {
    return null;
  }

  if (!geminiClient) {
    geminiClient = new GoogleGenerativeAI(apiKey);
  }

  return geminiClient;
}

function getCorsHeaders(origin) {
  const isAllowed = origin && allowedOrigins.includes(origin);

  return {
    "Access-Control-Allow-Origin": isAllowed ? origin : allowedOrigins[0],
    "Access-Control-Allow-Methods": "POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  };
}

async function loadKnowledgeBase() {
  if (knowledgeCache) {
    return knowledgeCache;
  }

  const fileContent = await readFile(KNOWLEDGE_FILE, "utf8");
  const parsed = JSON.parse(fileContent);

  knowledgeCache = Array.isArray(parsed.faq) ? parsed.faq : [];
  return knowledgeCache;
}

function buildSystemPrompt(faqEntries) {
  if (!faqEntries.length) {
    return BASE_SYSTEM_PROMPT;
  }

  const faqText = faqEntries
    .map((entry) => `Pergunta: ${entry.question}\nResposta: ${entry.answer}`)
    .join("\n\n");

  return `${BASE_SYSTEM_PROMPT}\nBase de conhecimento:\n${faqText}`;
}

function normalizeHistory(history) {
  if (!Array.isArray(history)) {
    return [];
  }

  return history
    .filter(
      (item) =>
        item &&
        typeof item.content === "string" &&
        ["user", "assistant"].includes(item.role)
    )
    .map((item) => ({
      role: item.role,
      content: item.content.trim()
    }))
    .filter((item) => item.content);
}

function toGeminiContents(history, message) {
  return [
    ...history.map((item) => ({
      role: item.role === "assistant" ? "model" : "user",
      parts: [{ text: item.content }]
    })),
    {
      role: "user",
      parts: [{ text: message.trim() }]
    }
  ];
}

async function generateGeminiAnswer(client, systemPrompt, history, message) {
  const preferredModel = process.env.GEMINI_MODEL || "gemini-2.0-flash";
  const candidateModels = [...new Set([preferredModel, "gemini-2.0-flash"])] ;
  let lastError;

  for (const modelName of candidateModels) {
    try {
      const model = client.getGenerativeModel({
        model: modelName,
        systemInstruction: systemPrompt
      });

      const response = await model.generateContent({
        contents: toGeminiContents(history, message)
      });

      return response.response.text();
    } catch (error) {
      lastError = error;

      if (error?.status !== 404) {
        throw error;
      }
    }
  }

  throw lastError;
}

export default async function handler(req, res) {
  const origin = req.headers.origin;
  const corsHeaders = getCorsHeaders(origin);

  Object.entries(corsHeaders).forEach(([header, value]) => {
    res.setHeader(header, value);
  });

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Método não permitido" });
  }

  try {
    const client = getClient();

    if (!client) {
      return res.status(500).json({ error: "GEMINI_API_KEY não configurada." });
    }

    const { message, history = [] } = req.body;

    if (typeof message !== "string" || !message.trim()) {
      return res.status(400).json({ error: "Mensagem obrigatória" });
    }

    const knowledgeBase = await loadKnowledgeBase();
    const safeHistory = normalizeHistory(history);
    const answer = await generateGeminiAnswer(
      client,
      buildSystemPrompt(knowledgeBase),
      safeHistory,
      message
    );

    return res.status(200).json({
      answer
    });
  } catch (error) {
    console.error("Erro no chat:", error);

    if (error?.status === 429 || error?.code === "insufficient_quota") {
      return res.status(429).json({
        error: "A cota da API Gemini foi excedida. Verifique o plano e o faturamento da conta Google AI." 
      });
    }

    if (error?.status === 401) {
      return res.status(401).json({
        error: "A chave da Gemini foi recusada. Verifique GEMINI_API_KEY."
      });
    }

    if (error?.status === 400 && error?.errorDetails?.some((detail) => detail?.reason === "API_KEY_INVALID")) {
      return res.status(401).json({
        error: "A chave informada não é válida para a API Gemini. Use uma chave do Google AI Studio ou da API Gemini."
      });
    }

    return res.status(500).json({
      error: "Erro interno ao processar a mensagem."
    });
  }
}