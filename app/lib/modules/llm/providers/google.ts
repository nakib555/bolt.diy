import { BaseProvider } from '~/lib/modules/llm/base-provider';
import type { ModelInfo } from '~/lib/modules/llm/types';
import type { IProviderSetting } from '~/types/model';
import type { LanguageModelV1 } from 'ai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';

export default class GoogleProvider extends BaseProvider {
  name = 'Google';
  getApiKeyLink = 'https://aistudio.google.com/app/apikey';

  config = {
    apiTokenKey: 'GOOGLE_GENERATIVE_AI_API_KEY',
  };

  // This list will now be the sole source of models for this provider
  staticModels: ModelInfo[] = [
    { name: 'gemini-1.5-flash-latest', label: 'Gemini 1.5 Flash', provider: 'Google', maxTokenAllowed: 8192 }, // Consider updating maxTokenAllowed if known & different
    {
      name: 'gemini-2.0-flash-thinking-exp-01-21',
      label: 'Gemini 2.0 Flash-thinking-exp-01-21',
      provider: 'Google',
      maxTokenAllowed: 65536,
    },
    { name: 'gemini-2.0-flash-exp', label: 'Gemini 2.0 Flash', provider: 'Google', maxTokenAllowed: 8192 },
    { name: 'gemini-1.5-flash-002', label: 'Gemini 1.5 Flash-002', provider: 'Google', maxTokenAllowed: 8192 },
    { name: 'gemini-1.5-flash-8b', label: 'Gemini 1.5 Flash-8b', provider: 'Google', maxTokenAllowed: 8192 },
    { name: 'gemini-1.5-pro-latest', label: 'Gemini 1.5 Pro', provider: 'Google', maxTokenAllowed: 1000000 }, // Example: updated to reflect larger context
    { name: 'gemini-1.5-pro-002', label: 'Gemini 1.5 Pro-002', provider: 'Google', maxTokenAllowed: 1000000 }, // Example: updated
    { name: 'gemini-exp-1206', label: 'Gemini exp-1206', provider: 'Google', maxTokenAllowed: 8192 },
    // You might want to add other known Gemini models here like:
    // { name: 'gemini-pro', label: 'Gemini Pro', provider: 'Google', maxTokenAllowed: 32768 },
    // { name: 'gemini-pro-vision', label: 'Gemini Pro Vision', provider: 'Google', maxTokenAllowed: 16384 },
  ];

  /**
   * Returns the static list of models. Dynamic fetching from API is removed.
   * The parameters are kept for compatibility with the BaseProvider interface,
   * but they are not used in this implementation.
   */
  async getDynamicModels(
    _apiKeys?: Record<string, string>, // Marked as unused
    _settings?: IProviderSetting,      // Marked as unused
    _serverEnv?: Record<string, string>, // Marked as unused
  ): Promise<ModelInfo[]> {
    // Return the hardcoded staticModels directly
    // The system consuming this provider will now use this list
    // as if they were "dynamically" fetched.
    return Promise.resolve(this.staticModels);
  }

  // getModelInstance remains the same as it's needed to use the selected model
  getModelInstance(options: {
    model: string;
    serverEnv: any;
    apiKeys?: Record<string, string>;
    providerSettings?: Record<string, IProviderSetting>;
  }): LanguageModelV1 {
    const { model, serverEnv, apiKeys, providerSettings }_ = options;

    const { apiKey } = this.getProviderBaseUrlAndKey({
      apiKeys,
      providerSettings: providerSettings?.[this.name],
      serverEnv: serverEnv as any,
      defaultBaseUrlKey: '',
      defaultApiTokenKey: 'GOOGLE_GENERATIVE_AI_API_KEY',
    });

    if (!apiKey) {
      // Still need an API key to use any model, even if the list is static
      throw new Error(`Missing API key for ${this.name} provider to instantiate model: ${model}`);
    }

    const google = createGoogleGenerativeAI({
      apiKey,
    });

    return google(model);
  }
}
