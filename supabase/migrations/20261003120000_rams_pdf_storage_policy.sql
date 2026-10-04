drop policy "Job parties can view RAMS PDFs" on storage.objects;

create policy "Job parties can view RAMS PDFs" on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'generated-documents'
    and (storage.foldername(name))[1] = 'rams'
    and exists (
      select 1 from public.job_rams r
      where r.pdf_storage_path = objects.name
    )
  );
