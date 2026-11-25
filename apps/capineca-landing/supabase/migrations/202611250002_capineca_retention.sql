-- Runs daily and removes expired B2B jobs and their private Storage assets.
do $$
declare
  scheduled_job_id bigint;
begin
  for scheduled_job_id in
    select jobid from cron.job where jobname = 'capineca_b2b_retention'
  loop
    perform cron.unschedule(scheduled_job_id);
  end loop;

  perform cron.schedule(
    'capineca_b2b_retention',
    '35 4 * * *',
    $task$
      select net.http_post(
        url := 'https://ssbesxgaijknwsjbsbcz.supabase.co/functions/v1/capineca-b2b',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'capineca_b2b_anon_key' limit 1),
          'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'capineca_b2b_anon_key' limit 1)
        ),
        body := jsonb_build_object('action', 'cleanup'),
        timeout_milliseconds := 60000
      );
    $task$
  );
end $$;
