// server/src/services/ChatService.ts
import { env } from '../config/environment';

export type ChatQuery = { text: string; crop?: string; lat?: number; lon?: number; context?: any };
export type ChatAnswer = { answer: string; model?: string; facts?: string[]; caution?: string[]; raw?: unknown };

export class ChatService {
  private static resolvedModel: string | null = null;

  private getApiKey(): string {
    const key = env.GEMINI_API_KEY || env.GEN_AI_API_KEY;
    if (!key) {
      throw Object.assign(new Error('Gemini API key not set'), { status: 503 });
    }
    return key;
  }

  private async resolveModel(): Promise<string> {
    const envModel = (env.GEN_AI_MODEL || '').trim();
    if (envModel) {
      // Allow both "gemini-..." and "models/gemini-..." from env
      return envModel.startsWith('models/') ? envModel.slice('models/'.length) : envModel;
    }
    if (ChatService.resolvedModel) return ChatService.resolvedModel;
    // Discover available models and pick a stable one
    try {
      const listUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${this.getApiKey()}`;
      const r = await fetch(listUrl);
      if (r.ok) {
        const j: any = await r.json();
        const models: { name?: string }[] = Array.isArray(j?.models) ? j.models : [];
        const names = models.map((m) => (m.name || '')).filter(Boolean);
        const pickFull =
          names.find((n) => n.includes('gemini-2.5-flash')) ||
          names.find((n) => n.includes('gemini-flash-latest')) ||
          names.find((n) => n.includes('gemini-2.0-flash')) ||
          names.find((n) => n.includes('gemini-2.5-pro')) ||
          '';
        const id = pickFull ? (pickFull.startsWith('models/') ? pickFull.slice('models/'.length) : pickFull) : 'gemini-2.5-flash';
        ChatService.resolvedModel = id;
        return id;
      }
    } catch {}
    // Fallback if discovery fails
    return 'gemini-2.5-flash';
  }

  private async callGemini(parts: any[]): Promise<{ model: string; raw: unknown; text: string }> {
    const key = this.getApiKey();
    let model = await this.resolveModel();

    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
        const resp = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts }],
          }),
        });

        const raw = await resp.json().catch(() => ({}));
        if (!resp.ok) {
          const apiMessage = raw?.error?.message || `Gemini request failed (${resp.status})`;
          const status = resp.status >= 500 ? 503 : resp.status;
          throw Object.assign(new Error(apiMessage), { status });
        }

        const text =
          raw?.candidates
            ?.flatMap((candidate: any) => candidate?.content?.parts || [])
            ?.map((part: any) => part?.text || '')
            ?.join('\n')
            ?.trim() || '';

        return { model, raw, text };
      } catch (e: any) {
        const missingModel = e?.status === 404 || String(e?.message || '').includes('not found');
        if (attempt === 0 && missingModel) {
          ChatService.resolvedModel = null;
          model = await this.resolveModel();
          continue;
        }
        if (e?.status) throw e;
        throw Object.assign(new Error('Could not reach Gemini API from the server. Check the API key, firewall, proxy, or internet connection.'), {
          status: 503,
        });
      }
    }
    throw Object.assign(new Error('Gemini request failed'), { status: 503 });
  }

  async ask(q: ChatQuery): Promise<ChatAnswer> {
    // Require LLM configuration; no demo fallback
    if (!(env.GEN_AI_API_KEY || env.GEMINI_API_KEY)) {
      throw Object.assign(new Error('LLM not configured'), { status: 503 });
    }

    // Compose prompt
    const contextBits: string[] = [];
    if (q.crop) contextBits.push(`Crop: ${q.crop}`);
    if (typeof q.lat === 'number' && typeof q.lon === 'number') contextBits.push(`Location: ${q.lat}, ${q.lon}`);
    const contextLine = contextBits.length ? `\nContext: ${contextBits.join(' | ')}` : '';
    const prompt = `Answer concisely for an Indian farmer. Avoid brand names. Provide practical steps. Question: ${q.text}${contextLine}`;

    const data = await this.callGemini([{ text: prompt }]);
    const text = data.text || 'No answer';

    const facts: string[] = [];
    if (q.crop) facts.push(`Crop: ${q.crop}`);
    if (typeof q.lat === 'number' && typeof q.lon === 'number') facts.push(`Location: ${q.lat.toFixed(2)},${q.lon.toFixed(2)}`);

    return {
      answer: text.trim(),
      model: data.model,
      facts,
      raw: data.raw,
    };
  }
}
