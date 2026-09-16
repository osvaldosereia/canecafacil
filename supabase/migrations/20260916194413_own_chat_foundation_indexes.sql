create index chat_sessions_visitor_id_idx
  on public.chat_sessions(visitor_id);

create index chat_visitors_customer_id_idx
  on public.chat_visitors(customer_id);
