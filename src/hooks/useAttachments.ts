import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { randomId } from '../lib/utils';
import type { Attachment, EntityType } from '../types';

export function useAttachments(entityType: EntityType, entityId: string | undefined) {
  return useQuery({
    queryKey: ['attachments', entityType, entityId],
    enabled: !!entityId,
    queryFn: async (): Promise<Attachment[]> => {
      const { data, error } = await supabase
        .from('attachments')
        .select('*')
        .eq('entity_type', entityType)
        .eq('entity_id', entityId!)
        .order('created_at');
      if (error) throw error;
      return (data ?? []) as Attachment[];
    }
  });
}

/**
 * How many photos each of these records carries, in one round trip.
 * Used where a list needs to say "this job has a picture" without loading
 * every file row for every job on the page.
 */
export function useAttachmentPhotoCounts(entityType: EntityType, entityIds: string[]) {
  const key = [...entityIds].sort().join(',');
  const query = useQuery({
    queryKey: ['attachment-photo-counts', entityType, key],
    enabled: entityIds.length > 0,
    queryFn: async (): Promise<Record<string, number>> => {
      const { data, error } = await supabase
        .from('attachments')
        .select('entity_id, mime_type')
        .eq('entity_type', entityType)
        .in('entity_id', entityIds);
      if (error) throw error;
      const counts: Record<string, number> = {};
      for (const row of (data ?? []) as Array<{ entity_id: string; mime_type: string }>) {
        if (!row.mime_type?.startsWith('image/')) continue;
        counts[row.entity_id] = (counts[row.entity_id] ?? 0) + 1;
      }
      return counts;
    }
  });
  return query.data ?? {};
}

export function useAttachmentMutations(entityType: EntityType, entityId: string | undefined) {
  const queryClient = useQueryClient();
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['attachments', entityType, entityId] });
    queryClient.invalidateQueries({ queryKey: ['display'] });
    queryClient.invalidateQueries({ queryKey: ['events'] });
  };

  const upload = useMutation({
    mutationFn: async ({ file, userId }: { file: File; userId: string }) => {
      const safeName = file.name.replace(/[^\w.\-() ]+/g, '_');
      const path = `${entityType}/${entityId}/${randomId()}-${safeName}`;
      const { error: storageError } = await supabase.storage.from('attachments').upload(path, file, {
        cacheControl: '3600',
        upsert: false
      });
      if (storageError) throw storageError;
      const { data, error: rowError } = await supabase.from('attachments').insert({
        entity_type: entityType,
        entity_id: entityId,
        file_name: file.name,
        storage_path: path,
        mime_type: file.type || 'application/octet-stream',
        size_bytes: file.size,
        uploaded_by: userId
      }).select().single();
      if (rowError) {
        await supabase.storage.from('attachments').remove([path]);
        throw rowError;
      }
      return data as Attachment;
    },
    onSuccess: invalidate
  });

  const remove = useMutation({
    mutationFn: async (attachment: Attachment) => {
      await supabase.storage.from('attachments').remove([attachment.storage_path]);
      const { error } = await supabase.from('attachments').delete().eq('id', attachment.id);
      if (error) throw error;
    },
    onSuccess: invalidate
  });

  return { upload, remove };
}

export async function getSignedUrl(storagePath: string, expiresIn = 3600): Promise<string> {
  const { data, error } = await supabase.storage.from('attachments').createSignedUrl(storagePath, expiresIn);
  if (error || !data) throw error ?? new Error('Could not create signed URL');
  return data.signedUrl;
}

export async function downloadAttachment(attachment: Attachment): Promise<void> {
  const url = await getSignedUrl(attachment.storage_path);
  const link = document.createElement('a');
  link.href = url;
  link.download = attachment.file_name;
  link.target = '_blank';
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  link.remove();
}
