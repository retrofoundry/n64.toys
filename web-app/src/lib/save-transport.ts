export type ServiceErrorKind =
  | "not_found"
  | "forbidden"
  | "quota"
  | "conflict"
  | "storage"
  | "validation";

export type ServiceError = {
  kind: ServiceErrorKind;
  message: string;
};

export type Result<T> =
  | { ok: true; value: T }
  | { ok: false; error: ServiceError };

export interface SaveTransport {
  create(body: FormData): Promise<Result<{ slug: string }>>;
  update(
    slug: string,
    body: FormData,
  ): Promise<Result<{ slug: string }>>;
  delete(slug: string): Promise<Result<{ slug: string }>>;
}

type ErrorEnvelope = {
  error: {
    code: string;
    message: string;
  };
};

function isErrorEnvelope(value: unknown): value is ErrorEnvelope {
  if (typeof value !== "object" || value === null) return false;
  const error = (value as { error?: unknown }).error;
  return (
    typeof error === "object" &&
    error !== null &&
    typeof (error as { code?: unknown }).code === "string" &&
    typeof (error as { message?: unknown }).message === "string"
  );
}

function errorKind(status: number, code: string): ServiceErrorKind {
  switch (code) {
    case "not_found":
      return "not_found";
    case "forbidden":
    case "unauthorized":
      return "forbidden";
    case "quota_exceeded":
      return "quota";
    case "conflict":
      return "conflict";
    case "storage_error":
      return "storage";
    case "validation_error":
      return "validation";
  }

  if (status === 404) return "not_found";
  if (status === 401 || status === 403) return "forbidden";
  if (status === 409) return "conflict";
  if (status >= 500) return "storage";
  return "validation";
}

async function mapResponse(
  response: Response,
): Promise<Result<{ slug: string }>> {
  const payload: unknown = await response.json().catch(() => null);
  if (response.ok) {
    if (
      typeof payload === "object" &&
      payload !== null &&
      typeof (payload as { slug?: unknown }).slug === "string"
    ) {
      return {
        ok: true,
        value: { slug: (payload as { slug: string }).slug },
      };
    }
    return {
      ok: false,
      error: {
        kind: "storage",
        message: "The server returned an invalid response.",
      },
    };
  }

  const code = isErrorEnvelope(payload) ? payload.error.code : "";
  return {
    ok: false,
    error: {
      kind: errorKind(response.status, code),
      message: isErrorEnvelope(payload)
        ? payload.error.message
        : "Unable to save toy.",
    },
  };
}

export class HttpSaveTransport implements SaveTransport {
  async create(body: FormData): Promise<Result<{ slug: string }>> {
    return mapResponse(
      await fetch("/api/toys", {
        method: "POST",
        body,
        credentials: "include",
      }),
    );
  }

  async update(
    slug: string,
    body: FormData,
  ): Promise<Result<{ slug: string }>> {
    return mapResponse(
      await fetch(`/api/toys/${encodeURIComponent(slug)}`, {
        method: "PUT",
        body,
        credentials: "include",
      }),
    );
  }

  async delete(slug: string): Promise<Result<{ slug: string }>> {
    return mapResponse(
      await fetch(`/api/toys/${encodeURIComponent(slug)}`, {
        method: "DELETE",
        credentials: "include",
      }),
    );
  }
}
