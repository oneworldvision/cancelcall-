# Cancel Call Management System: Deploy in 4 steps

1. **Supabase**: create a project, open *SQL Editor*, paste all of `schema.sql`, click *Run*.
2. **Keys**: in Supabase go to *Project Settings > API*. Copy the *Project URL* and the *anon public key* into the two constants at the top of the `<script>` in `index.html`.
3. **GitHub Pages**: create a repo, upload `index.html`, then *Settings > Pages > Deploy from branch > main / root*.
4. **First login**: choose *SDE / BM / Admin*, then ID `admin` with password `admin123`. Open *Manage* and change the password right away. Create BM accounts there. ESAs and SDEs register themselves.

## Notes
- Ticket Number must contain its date as `YYYYMMDD` (or `DDMMYYYY`), for example `CC202611250012`. Change `tdate()` in `index.html` if your format differs.
- Notifications are live: ESA and SDE screens refresh every 20 seconds and show a pop-up when a call arrives or its status changes.
- No important records are ever deleted. Accounts and L-Codes are deactivated, not removed.
- ESA login by L-Code alone cannot be fully locked down with a browser-only app. Every row is readable with the public key, so L-Code privacy is enforced by the interface, not the database. For stronger protection, move to Supabase Auth later.
