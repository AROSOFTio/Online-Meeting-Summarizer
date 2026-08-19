# Starlight S.S Online Meeting Summarizer — User Manual

## 1. The simple meeting flow
For an organizer, the normal workflow is:

**New Meeting → Invite People → Start Meeting → End Meeting → Review Minutes**

For an invited participant, the normal workflow is:

**Open Invite → Confirm Name/Position → Enter Meeting**

Invitees do not need a staff username or password.

## 2. Roles
- **Administrator:** full system access, staff accounts, settings, backups, audit activity and all meetings.
- **Minute Secretary:** creates and starts meetings, manages invitations/attendance, reviews transcripts/minutes and action items.
- **Staff:** reads authorised completed meetings and action items.

## 3. Staff sign in
Open the site and use **Sign In** with the account issued by the school. The login page also has **Join an Invited Meeting** for people who only received a meeting link/code.

## 4. Create a meeting
1. Click **New Meeting** from the sidebar, dashboard or Meetings page.
2. Enter the meeting name and date/time.
3. Add agenda/notes if needed.
4. Add participant email addresses if you want the system to email invitations. This is optional.
5. Click **Create Meeting**.
6. The system immediately gives you:
   - **Start Meeting Now**;
   - a shareable invitation link;
   - **Share on WhatsApp**;
   - email delivery status when email addresses were entered.

If the meeting is scheduled for later, simply leave the page. Under **Meetings**, every scheduled meeting has a clear **Start Meeting** button.

## 5. Start and end a meeting
1. Open **Meetings** and click **Start Meeting**, or click **Start Meeting Now** immediately after creation.
2. On the Host Meeting screen, click **Start Meeting**.
3. Allow microphone permission in the browser.
4. Keep the page open while the meeting is in progress. The timer shows that recording is active.
5. At the end, click **End Meeting & Generate Minutes**.
6. The recording is uploaded, processed with FFmpeg and Google Gemini, and the system takes you to the meeting while the transcript/minutes are prepared.

If the meeting was recorded on another device, choose **Upload recording instead** on the Host Meeting screen.

## 6. Invitee joining
An invited participant can open the link directly from email/WhatsApp. If they only have a code, they can click **Join an Invited Meeting** on the public sign-in page and enter it.

The participant enters their full name and title/position, then clicks **Confirm & Enter Meeting**. They are taken directly to a simple Meeting Room confirmation page. Their attendance is recorded automatically; there is no second login or extra setup.

## 7. Meeting workspace
After processing, the meeting contains:
- **Overview:** agenda and attendance register.
- **Recording:** authorised playback/download.
- **Transcript:** timestamped speaker turns that authorised editors can correct.
- **Minutes:** generated minutes, key points and decisions that authorised editors can review/edit.
- **Action Items:** responsible person, deadline, priority and status.

A scheduled meeting also keeps a visible **Start Meeting** action so the organizer does not have to hunt for the correct screen.

## 8. Action items
Use **Action Items** to filter by status, priority, responsible person and deadline. A responsible person can be selected from known people or typed manually even when that person has no system account.

## 9. Official exports
From the meeting workspace choose **PDF** or **Word**. Official exports use the configured Starlight identity and include attendance, proceedings, decisions and action items. The transcript appendix starts on a separate page. TXT export is also supported by the API.

## 10. Notifications
The notification bell shows recent completed meetings, failed processing that needs attention and open action items relevant to the current user.

## 11. System Settings (Administrator)
Settings provides school identity/logo, timezone, recording retention, actual Google Gemini model/readiness, SMTP readiness, database/queue status, validated backups and recent audit activity.

## 12. Backups and restore
Administrators can create/download validated backups under Settings. PostgreSQL uses `pg_dump --format=custom`; local SQLite uses its backup API.

Restore is intentionally offline. Stop backend and worker services first, then run:

```bash
python scripts/restore_backup.py storage/backups/<backup-file> --yes
```

## 13. Retention cleanup
Retention cleanup only physically removes old recordings from **archived meetings**. Meeting metadata, transcripts, minutes, decisions and action items are preserved.

## 14. Email configuration
Invitation/final-minutes email requires:
`SMTP_HOST`, `SMTP_PORT`, `SMTP_USERNAME`, `SMTP_PASSWORD`, `SMTP_FROM_EMAIL`, `SMTP_USE_SSL`, `SMTP_USE_STARTTLS`, `SMTP_VERIFY_TLS`.

## 15. Gemini configuration
Production transcription and structured minutes require `GEMINI_API_KEY`. `GEMINI_MODEL` selects the deployment model. The Settings page reports the effective model/readiness.

## 16. Troubleshooting
- **Microphone does not start:** allow microphone permission in the browser and make sure another application is not exclusively using the microphone.
- **Meeting processing fails:** fix the reported problem and use Retry on the same meeting rather than creating a duplicate.
- **Invitation email does not send:** the link is still usable; copy/share it while SMTP is being fixed.
- **Old logo/favicon remains after deployment:** hard refresh/reopen the tab. The service-worker cache version is bumped when branding assets change.
- **Backup fails:** verify PostgreSQL client tools are present and the backend can reach the database.

## 17. Security
Keep API keys, SMTP passwords and database passwords in Coolify environment variables, not source control. Recording/backup downloads require authorisation; backup creation, audit activity and retention cleanup require administrator access.
