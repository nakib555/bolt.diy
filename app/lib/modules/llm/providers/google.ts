import { BaseProvider } from '~/lib/modules/llm/base-provider';
import type { ModelInfo } from '~/lib/modules/llm/types';
import type { IProviderSetting } from '~/types/model';
import type { LanguageModelV1 } from 'ai'; // Assuming this is from @ai-sdk/core or similar
import { createGoogleGenerativeAI } from '@ai-sdk/google';

// Define a more specific type for the expected model structure from Google's API
interface GoogleApiModel {
  name: string;
  displayName?: string;
  description?: string;
  version?: string;
  inputTokenLimit?: number;
  outputTokenLimit?: number;
  supportedGenerationMethods?: string[];
  // Add other properties if needed
}

interface GoogleApiModelsResponse {
  models: GoogleApiModel[];
  // nextPageToken?: string; // If pagination is handled
}

export default class GoogleProvider extends BaseProvider {
  name = 'Google';
  getApiKeyLink = 'https://aistudio.google.com/app/apikey';

  config = {
    apiTokenKey: 'GOOGLE_GENERATIVE_AI_API_KEY',
  };

  // Static models serve as a fallback or for offline use
  staticModels: ModelInfo[] = [
    { name: 'gemini-1.5-flash-latest', label: 'Gemini 1.5 Flash (Latest)', provider: 'Google', maxTokenAllowed: 8192 }, // Often total context for static is simplified
    {
      name: 'gemini-2.0-flash-thinking-exp-01-21', // Example experimental model
      label: 'Gemini 2.0 Flash-thinking-exp-01-21',
      provider: 'Google',
      maxTokenAllowed: 65536,
    },
    { name: 'gemini-2.0-flash-exp', label: 'Gemini 2.0 Flash (Exp)', provider: 'Google', maxTokenAllowed: 8192 },
    { name: 'gemini-1.5-flash-002', label: 'Gemini 1.5 Flash (002)', provider: 'Google', maxTokenAllowed: 8192 },
    { name: 'gemini-1.5-flash-8b', label: 'Gemini 1.5 Flash (8B)', provider: 'Google', maxTokenAllowed: 8192 },
    { name: 'gemini-1.5-pro-latest', label: 'Gemini 1.5 Pro (Latest)', provider: 'Google', maxTokenAllowed: 1048576 }, // Updated to reflect ~1M context
    { name: 'gemini-1.5-pro-002', label: 'Gemini 1.5 Pro (002)', provider: 'Google', maxTokenAllowed: 1048576 },
    { name: 'gemini-exp-1206', label: 'Gemini Exp (1206)', provider: 'Google', maxTokenAllowed: 8192 },
    // It's good practice to keep staticModels somewhat aligned with popular/stable dynamic models
    // For example, adding a known stable one:
    { name: 'gemini-pro', label: 'Gemini Pro', provider: 'Google', maxTokenAllowed: 32768 } // (30720 input + 2048 output)
  ];

  async getDynamicModels(
    apiKeys?: Record<string, string>,
    settings?: IProviderSetting,
    serverEnv?: Record<string, string>,
  ): Promise<ModelInfo[]> {
    const { apiKey } = this.getProviderBaseUrlAndKey({
      apiKeys,
      providerSettings: settings,
      serverEnv: serverEnv as any, // Cast if necessary, ensure type safety upstream
      defaultBaseUrlKey: '', // Google GenAI doesn't use a separate base URL for model listing in this SDK path
      defaultApiTokenKey: this.config.apiTokenKey,
    });

    if (!apiKey) {
      console.warn(`Missing API Key for ${this.name} provider. Falling back to static models.`);
      return this.staticModels;
    }

    try {
      // Note: The official Google AI SDK might have its own methods to list models,
      // but direct fetch is also common if the SDK doesn't expose it or for more control.
      // This endpoint is for the Generative Language API (used by Gemini API / Google AI Studio).
      // Vertex AI has a different model listing mechanism.
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorBody = await response.text();
        console.error(
          `Error fetching dynamic models from ${this.name}: ${response.status} ${response.statusText}. Body: ${errorBody}`,
        );
        console.warn(`Falling back to static models for ${this.name}.`);
        return this.staticModels;
      }

      const res = (await response.json()) as GoogleApiModelsResponse;

      if (!res || !Array.isArray(res.models)) {
        console.error(`Unexpected response structure from ${this.name} model API.`);
        console.warn(`Falling back to static models for ${this.name}.`);
        return this.staticModels;
      }

      // Filter for models that support content generation and have necessary details
      const generativeModels = res.models.filter(
        (model: GoogleApiModel) =>
          model.name && // Ensure model has a name
          model.supportedGenerationMethods &&
          model.supportedGenerationMethods.includes('generateContent') && // Key filter for LLMs
          (model.inputTokenLimit || 0) > 0 && // Ensure it can take input
          (model.outputTokenLimit || 0) > 0    // Ensure it can produce output
      );

      if (generativeModels.length === 0) {
        console.warn(`No dynamic generative models found for ${this.name} after filtering. Falling back to static models.`);
        return this.staticModels;
      }

      return generativeModels.map((m: GoogleApiModel) => {
        const inputTokens = m.inputTokenLimit || 0;
        const outputTokens = m.outputTokenLimit || 0;
        const totalContext = inputTokens + outputTokens;
        const contextK = Math.floor(totalContext / 1000);

        return {
          name: m.name.replace('models/', ''), // Strip 'models/' prefix for use with SDK
          label: `${m.displayName || m.name.replace('models/', '')}${contextK > 0 ? ` - ${contextK}k context` : ''}`,
          provider: this.name,
          maxTokenAllowed: totalContext || 8192, // Fallback if totalContext is 0
          // You could add more properties from 'm' if your ModelInfo type supports them
          // e.g., description: m.description,
        };
      });
    } catch (error)
    {
      console.error(`Network or unexpected error in getDynamicModels for ${this.name}:`, error);
      console.warn(`Falling back to static models for ${this.name}.`);
      return this.staticModels;
    }
  }

  getModelInstance(options: {
    model: string; // This should be the name like 'gemini-1.5-pro-latest' (without 'models/')
    serverEnv: any;
    apiKeys?: Record<string, string>;
    providerSettings?: Record<string, IProviderSetting>; // Assuming this is Record<ProviderName, Setting>
  }): LanguageModelV1 {
    const { model, serverEnv, apiKeys, providerSettings } = options;

    const { apiKey } = this.getProviderBaseUrlAndKey({
      apiKeys,
      providerSettings: providerSettings?.[this.name], // Get settings specific to this provider
      serverEnv: serverEnv as any,
      defaultBaseUrlKey: '',
      defaultApiTokenKey: this.config.apiTokenKey,
    });

    if (!apiKey) {
      // This error should ideally be caught by the calling code to inform the user
      throw new Error(`Missing API key for ${this.name} provider. Cannot instantiate model.`);
    }

    const google = createGoogleGenerativeAI({
      apiKey: apiKey,
      // You can add other configurations like 'baseURL', 'headers' if needed by createGoogleGenerativeAI
    });

    // The model name passed to `google()` should be the one expected by the SDK,
    // typically without the 'models/' prefix, e.g., 'gemini-1.5-pro-latest'.
    // The `name` property in `ModelInfo` should already be formatted this way.
    return google(model);
  }
}
