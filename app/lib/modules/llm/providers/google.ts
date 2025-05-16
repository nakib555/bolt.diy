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
