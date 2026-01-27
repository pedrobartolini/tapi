export type Language = "en" | "br";

export interface Translations {
  errors: {
    requestFailed: string;
    invalidErrorFormat: string;
  };
  builder: {
    hostRequired: string;
    routesRequired: string;
    errorHandlerRequired: string;
  };
}

const translations: Record<Language, Translations> = {
  en: {
    errors: {
      requestFailed: "Unable to complete the request",
      invalidErrorFormat: "Invalid error message format"
    },
    builder: {
      hostRequired: "Host is required - use .withHost() first",
      routesRequired: "Routes are required - use .withRoutes() first",
      errorHandlerRequired: "Error handler is required - use .withApiError() first"
    }
  },
  br: {
    errors: {
      requestFailed: "Não foi possível completar a requisição",
      invalidErrorFormat: "Formato de mensagem de erro inválido"
    },
    builder: {
      hostRequired: "Host é obrigatório - use .withHost() primeiro",
      routesRequired: "Rotas são obrigatórias - use .withRoutes() primeiro",
      errorHandlerRequired: "Manipulador de erro é obrigatório - use .withApiError() primeiro"
    }
  }
};

export function getTranslations(language: Language = "en"): Translations {
  return translations[language];
}

export function t(language: Language = "en"): Translations {
  return getTranslations(language);
}
