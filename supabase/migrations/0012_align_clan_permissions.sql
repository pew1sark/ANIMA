drop policy if exists "team_tasks_insert_clan" on public.team_tasks;
create policy "team_tasks_insert_clan" on public.team_tasks for insert with check (public.can_edit_clan(clan));
drop policy if exists "team_tasks_update_clan" on public.team_tasks;
create policy "team_tasks_update_clan" on public.team_tasks for update using (public.can_edit_clan(clan)) with check (public.can_edit_clan(clan));
drop policy if exists "reminders_insert_clan" on public.reminders;
create policy "reminders_insert_clan" on public.reminders for insert with check (public.can_edit_clan(clan));
drop policy if exists "reminders_update_clan" on public.reminders;
create policy "reminders_update_clan" on public.reminders for update using (public.can_edit_clan(clan)) with check (public.can_edit_clan(clan));;