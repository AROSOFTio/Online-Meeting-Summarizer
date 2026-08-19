# Starlight S.S Online Meeting Summarizer — User Manual

## 1. Purpose
The system records or uploads school meetings, converts media with FFmpeg, transcribes speech with Google Gemini, stores timestamps and speaker turns, generates editable minutes, tracks decisions/action items, invites participants, and exports official PDF/DOCX/TXT minutes.

## 2. Roles
- **Administrator:** full access, staff accounts, settings, backups, audit activity, all meetings and exports.
- **Minute Secretary:** creates meetings, records/uploads media, edits transcripts/minutes, manages attendance, invitations and action items for meetings they manage.
- **Staff:** reads authorised completed meetings and action items.

## 3. Login
Open the deployed site and sign in with your assigned email/password. Administrators create or deactivate staff under **Staff**. Change production administrator credentials through environment variables rather than source code.

## 4. Schedule and invite a meeting
1. Open **Schedule & Invite**.
2. Enter the meeting title, date and agenda/description.
3. Enter participant emails, or leave the email box empty for a general link.
4. Create the meeting.
5. Copy the general link for WhatsApp, or use the personal links emailed to participants.
6. A participant opening `/join/<code>` enters full name and title/position. They may choose Member, Staff, Support Staff, Secretary, Chairperson, Vice Chairperson, Headteacher, Treasurer or Other.

## 5. Record or upload a meeting
1. Open **Record / Upload**.
2. Enter meeting details and attendance.
3. Either record in the browser or upload WAV, MP3, M4A, MP4, WebM or OGG.
4. Start processing.
5. The pipeline shows upload, FFmpeg conversion, Gemini transcription and minutes generation.
6. If processing fails, use **Retry** on the same meeting. Do not create a duplicate meeting.

## 6. Meeting workspace
- **Overview:** agenda and attendance register.
- **Recording:** play or download the authorised recording.
- **Transcript:** review timestamped speaker turns and correct text/speaker names.
- **Minutes:** review, edit or regenerate minutes and decisions.
- **Action Items:** track responsible person, deadline, priority and status.

## 7. Responsible person / assignee
Action items support both methods:
- choose/type the name of an existing staff/member shown by the picker; or
- type a completely new name for a person who does not have a system account.

## 8. Action item filters
Use **Action Items** to filter by status, priority, responsible person and deadline range. Pending/in-progress items also appear in the notification indicator.

## 9. Official exports
From a meeting workspace choose **PDF** or **Word**. The export uses the configured Starlight identity, attendance, proceedings, decisions and action items. The full transcript appendix starts on a separate page. TXT export is available through the API where required.

## 10. Notifications
The bell in authenticated pages shows:
- recent completed meetings;
- failed meeting processing that requires attention; and
- open action items relevant to the user.

## 11. System Settings (Administrator)
**System Settings & Operations** provides:
- school identity/letterhead details;
- official logo replacement;
- timezone and recording retention;
- read-only runtime status for Google Gemini and the configured model;
- Gemini API readiness, SMTP readiness, database and queue status;
- validated database backups; and
- recent audit activity.

The AI model is deployment configuration, so the Settings page reports the effective Gemini model instead of exposing a misleading model selector.

## 12. Backups and restore
### Create/download
Administrators can click **Create Backup** under System Settings. PostgreSQL backups use `pg_dump --format=custom`; SQLite development backups use the SQLite backup API. Each backup is validated before it is listed and downloadable.

### Restore safely
Restore is intentionally offline. Stop the backend and worker first, then inside the backend container/workspace run:

```bash
python scripts/restore_backup.py storage/backups/<backup-file> --yes
```

PostgreSQL restores use `pg_restore --clean --if-exists`. SQLite restores replace the database file after integrity validation. Keep a second external copy before restoring production.

## 13. Retention cleanup
The retention setting controls when **archived recordings** become eligible for physical deletion. Clicking **Run Retention Cleanup** deletes eligible archived recording files/rows but preserves meeting metadata, transcripts, minutes, decisions and action items.

## 14. Email configuration
Invitation/final-minutes email requires these Coolify environment variables:
`SMTP_HOST`, `SMTP_PORT`, `SMTP_USERNAME`, `SMTP_PASSWORD`, `SMTP_FROM_EMAIL`, `SMTP_USE_SSL`, `SMTP_USE_STARTTLS`, `SMTP_VERIFY_TLS`.

## 15. Gemini configuration
Production transcription and structured minutes require `GEMINI_API_KEY`. `GEMINI_MODEL` controls the deployed model; the Settings page displays the effective model but does not let ordinary UI changes alter infrastructure configuration.

## 16. Troubleshooting
- **No available server:** check Coolify service health and frontend domain routing to internal port 3000.
- **Gemini not configured:** add/rotate `GEMINI_API_KEY` in Coolify and redeploy.
- **Email not sent:** verify SMTP settings and server connectivity; invitation links still remain valid.
- **Failed processing:** open the meeting and retry the same meeting after fixing the cause.
- **Old logo/UI after deploy:** hard refresh the browser; the service worker cache is versioned.
- **Backup fails in PostgreSQL:** confirm the deployed backend image contains PostgreSQL client tools and can reach the database.

## 17. Security notes
Do not paste API keys, SMTP passwords or production database passwords into chat, tickets or source control. Use Coolify environment variables. Recording and backup download endpoints require authentication; backup creation, audit activity and retention cleanup require administrator access.
