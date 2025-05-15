import { BaseProvider } from '~/lib/modules/llm/base-provider';
import type { ModelInfo } from '~/lib/modules/llm/types'; // Ensure ModelInfo has isPreferred?
import type { IProviderSetting } from '~/types/model';
import type { LanguageModelV1 } from 'ai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';

// Define this at the class level or as a constant
// Adjust these patterns based on what you consider "preferred" or more cost-effective/free-tier
const PREFERRED_MODEL_PATTERNS: string[] = [
  'gemini-1.5-flash', // Models with "flash" are generally more cost-effective
  // Add other patterns or full names of models you consider "preferred"
  // e.g., if Google offered a specific 'gemini-free-tier-model'
];

export default class GoogleProvider extends BaseProvider {
  name = 'Google'; // Internal identifier
  // The label property for ProviderInfo should be used for display if different,
  // e.g., in the main list of providers you pass to ModelSelector.
  // For ModelSelector, provider.name from ProviderInfo is displayed.
  getApiKeyLink = 'https://aistudio.google.com/app/apikey';

  config = {
    apiTokenKey: 'GOOGLE_GENERATIVE_AI_API_KEY',
  };

  // Static models serve as a fallback or for offline scenarios.
  // Keep maxTokenAllowed values realistic or consistent with dynamic fetching logic.
  staticModels: ModelInfo[] = [
    { name: 'gemini-2.0-flash-thinking-exp-01-21', label: 'gemini-2.0-flash-thinking-exp-01-21', provider: 'Google', maxTokenAllowed: 1048576, isPreferred: true }, // Typical context for Flash 1.5
    { name: 'gemini-1.5-pro-latest', label: 'Gemini 1.5 Pro', provider: 'Google', maxTokenAllowed: 1048576, isPreferred: false },    // Typical context for Pro 1.5
    // Older models, may have smaller context windows or different naming conventions from the API
    { name: 'gemini-pro', label: 'Gemini 1.0 Pro', provider: 'Google', maxTokenAllowed: 32768, isPreferred: false },
    { name: 'gemini-pro-vision', label: 'Gemini 1.0 Pro Vision', provider: 'Google', maxTokenAllowed: 16384, isPreferred: false }, // Vision models often have different limits
  ];

  async getDynamicModels(
    apiKeys?: Record<string, string>,
    settings?: IProviderSetting,
    serverEnv?: Record<string, string>,
  ): Promise<ModelInfo[]> {
    const { apiKey } = this.getProviderBaseUrlAndKey({
      apiKeys,
      providerSettings: settings,
      serverEnv: serverEnv as any,
      defaultBaseUrlKey: '', // Google doesn't typically use a custom base URL for this API
      defaultApiTokenKey: this.config.apiTokenKey,
    });

    if (!apiKey) {
      console.warn(`Missing API Key for ${this.name}. Falling back to static models.`);
      // Mark static models with isPreferred based on patterns
      return this.staticModels.map(m => ({
        ...m,
        isPreferred: PREFERRED_MODEL_PATTERNS.some(pattern => m.name.includes(pattern)) || m.isPreferred,
      })).sort(this.sortModels);
    }

    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`, {
        headers: {
          ['Content-Type']: 'application/json',
        },
      });

      if (!response.ok) {
        const errorBody = await response.text().catch(() => 'Could not read error body');
        console.error(`Error fetching dynamic models from ${this.name}: ${response.status} ${response.statusText}. Body: ${errorBody}`);
        return this.staticModels.map(m => ({
             ...m,
             isPreferred: PREFERRED_MODEL_PATTERNS.some(pattern => m.name.includes(pattern)) || m.isPreferred,
        })).sort(this.sortModels);
      }

      const res = (await response.json()) as { models?: any[] };

      if (!res || !Array.isArray(res.models)) {
        console.error(`Unexpected response structure from ${this.name} model API:`, res);
        return this.staticModels.map(m => ({
             ...m,
             isPreferred: PREFERRED_MODEL_PATTERNS.some(pattern => m.name.includes(pattern)) || m.isPreferred,
        })).sort(this.sortModels);
      }

      const allDynamicModels: ModelInfo[] = res.models
        .filter(m => m.name && m.displayName) // Ensure basic fields are present
        .map((m: any) => {
          const modelName = m.name.replace(/^models\//, ''); // Remove 'models/' prefix
          const isPreferred = PREFERRED_MODEL_PATTERNS.some(pattern => modelName.includes(pattern));

          // Determine token limits, Google's API can be inconsistent here.
          // Prefer inputTokenLimit + outputTokenLimit if available.
          let totalTokenLimit = 0;
          if (typeof m.inputTokenLimit === 'number' && typeof m.outputTokenLimit === 'number') {
            totalTokenLimit = m.inputTokenLimit + m.outputTokenLimit;
          } else if (typeof m.tokenLimit === 'number') { // Fallback for older/some models
            totalTokenLimit = m.tokenLimit;
          }

          // If still zero, try to find in static or use a default (e.g., 8192).
          // The displayName can also be less user-friendly, so static label might be better.
          const staticMatch = this.staticModels.find(sm => sm.name === modelName);
          if (totalTokenLimit === 0) {
            totalTokenLimit = staticMatch?.maxTokenAllowed || 8192; // Sensible default
          }
          const label = staticMatch?.label || `${m.displayName} (${modelName.split('/').pop()})`; // Prefer static label or construct a decent one

          return {
            name: modelName,
            label: `${label} - context ${Math.floor(totalTokenLimit / 1000)}k`,
            provider: this.name,
            maxTokenAllowed: totalTokenLimit,
            isPreferred: isPreferred,
          };
        });

      // Sort models: preferred first, then by label
      allDynamicModels.sort(this.sortModels);

      return allDynamicModels;

    } catch (error) {
      console.error(`Failed to fetch or process dynamic models for ${this.name}:`, error);
      return this.staticModels.map(m => ({
        ...m,
        isPreferred: PREFERRED_MODEL_PATTERNS.some(pattern => m.name.includes(pattern)) || m.isPreferred,
      })).sort(this.sortModels);
    }
  }

  private sortModels(a: ModelInfo, b: ModelInfo): number {
    if (a.isPreferred && !b.isPreferred) return -1;
    if (!a.isPreferred && b.isPreferred) return 1;
    return a.label.localeCompare(b.label);
  }

  getModelInstance(options: {
    model: string;
    serverEnv: any;
    apiKeys?: Record<string, string>;
    providerSettings?: Record<string, IProviderSetting>;
  }): LanguageModelV1 {
    const { model, serverEnv, apiKeys, providerSettings } = options;

    const { apiKey } = this.getProviderBaseUrlAndKey({
      apiKeys,
      providerSettings: providerSettings?.[this.name],
      serverEnv: serverEnv as any,
      defaultBaseUrlKey: '',
      defaultApiTokenKey: this.config.apiTokenKey,
    });

    if (!apiKey) {
      throw new Error(`Missing API key for ${this.name} provider when trying to get model instance.`);
    }

    const google = createGoogleGenerativeAI({
      apiKey,
      // You can add other configurations here like 'baseURL', 'headers' if needed by @ai-sdk/google
    });

    // The model name passed to @ai-sdk/google often needs the "models/" prefix
    // but your internal 'name' might not have it. Adjust as necessary.
    // The @ai-sdk/google usually handles this, but good to be aware.
    // For example, if your `model` prop is "gemini-1.5-pro-latest", it should work.
    // If it was "models/gemini-1.5-pro-latest", it would also work.
    return google(model);
  }
}
