// server/src/services/PestService.ts
import { env } from '../config/environment';

export type AnalyzeReq = {
  file: Express.Multer.File;
  crop?: string;
  notes?: string;
  lat?: number;
  lon?: number;
};

export type PestAnalysis = {
  prediction?: string;
  confidence?: number;
  likely_causes?: string[];
  recommended_actions?: string[];
  caution?: string[];
  model?: string;
  raw?: unknown;
};

export class PestService {
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
    if (envModel) return envModel.startsWith('models/') ? envModel.slice('models/'.length) : envModel;
    if (PestService.resolvedModel) return PestService.resolvedModel;
    try {
      const listUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${this.getApiKey()}`;
      const r = await fetch(listUrl);
      if (r.ok) {
        const j: any = await r.json();
        const models: { name?: string }[] = Array.isArray(j?.models) ? j.models : [];
        const names = models.map((m) => m.name || '').filter(Boolean);
        const pickFull =
          names.find((n) => n.includes('gemini-2.5-flash')) ||
          names.find((n) => n.includes('gemini-flash-latest')) ||
          names.find((n) => n.includes('gemini-2.0-flash')) ||
          names.find((n) => n.includes('gemini-2.5-pro')) ||
          '';
        const id = pickFull ? (pickFull.startsWith('models/') ? pickFull.slice('models/'.length) : pickFull) : 'gemini-2.5-flash';
        PestService.resolvedModel = id;
        return id;
      }
    } catch {}
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
          PestService.resolvedModel = null;
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

  async analyze({ file, crop, notes, lat, lon }: AnalyzeReq): Promise<PestAnalysis> {
    // Require LLM configuration; no demo fallback
    if (!(env.GEN_AI_API_KEY || env.GEMINI_API_KEY)) {
      throw Object.assign(new Error('LLM not configured'), { status: 503 });
    }

    // Real provider path (Gemini multimodal via inline image)
    const base64 = file.buffer.toString('base64');
    const instruction = `You are an agronomy assistant. Analyze the plant image and return a concise JSON with fields: prediction, confidence(0..1), likely_causes[], recommended_actions[], caution[]. Avoid extra text.`;
    const parts = [
      { text: instruction },
      ...(crop ? [{ text: `\nCrop: ${crop}` }] : []),
      ...(notes ? [{ text: `\nNotes: ${notes}` }] : []),
      ...(typeof lat === 'number' && typeof lon === 'number' ? [{ text: `\nLocation: ${lat}, ${lon}` }] : []),
      { inlineData: { mimeType: file.mimetype || 'image/jpeg', data: base64 } },
    ];
    const data = await this.callGemini(parts);
    const rawText = data.text || '';

    // Attempt to parse JSON from model output
    let parsed: any = null;
    try {
      const cleaned = rawText.trim().replace(/^```json\s*/i, '').replace(/```$/i, '');
      parsed = JSON.parse(cleaned);
    } catch {}

    if (parsed && typeof parsed === 'object') {
      return {
        prediction: parsed.prediction,
        confidence: parsed.confidence,
        likely_causes: parsed.likely_causes,
        recommended_actions: parsed.recommended_actions,
        caution: parsed.caution,
        model: data.model,
        raw: data.raw,
      };
    }

    // Fallback: return the raw text as a single advisory
    return {
      prediction: 'See analysis notes',
      confidence: undefined,
      recommended_actions: undefined,
      caution: [rawText || 'Model returned no structured output'],
      model: data.model,
      raw: data.raw,
    };
  }
}
