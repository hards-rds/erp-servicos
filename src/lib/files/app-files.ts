import { createServiceClient } from "@/lib/supabase/server";

export const PRIVATE_FILES_BUCKET = "erp-private-files";

export type StoredFile = {
  id: string;
  storage_bucket: string;
  storage_path: string;
  content_type: string | null;
};

export async function ensurePrivateFilesBucket() {
  const supabase = createServiceClient();
  const { data: bucket } = await supabase.storage.getBucket(PRIVATE_FILES_BUCKET);
  if (bucket) return;

  const { error } = await supabase.storage.createBucket(PRIVATE_FILES_BUCKET, {
    public: false,
    fileSizeLimit: 10 * 1024 * 1024
  });
  if (error && !/already exists/i.test(error.message)) {
    throw new Error(`Nao foi possivel preparar o armazenamento privado: ${error.message}`);
  }
}

export async function storePrivateFile(options: {
  companyId: string;
  path: string;
  content: Buffer;
  contentType: string;
  createdBy?: string | null;
}) {
  await ensurePrivateFilesBucket();
  const supabase = createServiceClient();
  const { error: uploadError } = await supabase.storage
    .from(PRIVATE_FILES_BUCKET)
    .upload(options.path, options.content, {
      contentType: options.contentType,
      upsert: true
    });

  if (uploadError) {
    throw new Error(`Nao foi possivel salvar o arquivo: ${uploadError.message}`);
  }

  const { data: existing } = await supabase
    .from("files")
    .select("id")
    .eq("company_id", options.companyId)
    .eq("storage_bucket", PRIVATE_FILES_BUCKET)
    .eq("storage_path", options.path)
    .maybeSingle();

  if (existing?.id) {
    await supabase
      .from("files")
      .update({
        content_type: options.contentType,
        sensitive: true,
        created_by: options.createdBy || null
      })
      .eq("id", existing.id);
    return existing.id as string;
  }

  const { data, error } = await supabase
    .from("files")
    .insert({
      company_id: options.companyId,
      storage_bucket: PRIVATE_FILES_BUCKET,
      storage_path: options.path,
      content_type: options.contentType,
      sensitive: true,
      created_by: options.createdBy || null
    })
    .select("id")
    .single();

  if (error || !data?.id) {
    throw new Error(`Nao foi possivel registrar o arquivo: ${error?.message || "sem retorno"}`);
  }

  return data.id as string;
}

export async function downloadPrivateFile(file: StoredFile) {
  const supabase = createServiceClient();
  const { data, error } = await supabase.storage
    .from(file.storage_bucket)
    .download(file.storage_path);

  if (error || !data) {
    throw new Error(`Nao foi possivel baixar o arquivo: ${error?.message || "arquivo vazio"}`);
  }

  return Buffer.from(await data.arrayBuffer());
}
