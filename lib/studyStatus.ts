export type StudyStatusResult = {
  isOpen: boolean;
  updatedAt: string | null;
  source: 'table' | 'default';
  warning?: string;
};

export async function fetchStudyStatus(supabase: any): Promise<StudyStatusResult> {
  const { data, error } = await supabase
    .from('study_config')
    .select('is_open,updated_at')
    .eq('id', 1)
    .maybeSingle();

  if (error) {
    return {
      isOpen: true,
      updatedAt: null,
      source: 'default',
      warning: error.message,
    };
  }

  if (!data) {
    return {
      isOpen: true,
      updatedAt: null,
      source: 'default',
    };
  }

  return {
    isOpen: data.is_open !== false,
    updatedAt: data.updated_at ?? null,
    source: 'table',
  };
}

export async function upsertStudyStatus(
  supabase: any,
  isOpen: boolean
): Promise<{ isOpen: boolean; updatedAt: string | null; error?: string }> {
  const { data, error } = await supabase
    .from('study_config')
    .upsert(
      {
        id: 1,
        is_open: isOpen,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'id' }
    )
    .select('is_open,updated_at')
    .single();

  if (error) {
    return {
      isOpen,
      updatedAt: null,
      error: error.message,
    };
  }

  return {
    isOpen: data?.is_open !== false,
    updatedAt: data?.updated_at ?? null,
  };
}
