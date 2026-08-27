# ConveneCore — User Manual

**Academic case study default:** Starlight Secondary School, Amuria District, Uganda

ConveneCore is the software brand. The organization using a deployment controls its own workspace name, logo, minutes terminology and official export identity from **Settings**.

## 1. The simple meeting flow
For an organizer, the normal workflow is:

**New Meeting → Invite People → Start Meeting → End Meeting → Review Minutes**

For an invited participant, the normal workflow is:

**Open Invite → Confirm Identity → Enter Meeting**

Invitees do not need a staff username or password.

## 2. Roles
- **Administrator:** full system access, staff accounts, organization settings, backups, audit activity and all meetings.
- **Minute Secretary:** creates and starts meetings, manages invitations/attendance, reviews transcripts/minutes and action items.
- **Staff:** reads authorised completed meetings and action items.

## 3. Product and organization branding
ConveneCore uses two branding layers:

- **ConveneCore** is the product identity in the application shell and platform metadata.
- **Organization workspace branding** is configured by the administrator and appears on invitation/join experiences, meeting records and official exports.

Changing an organization's logo or name does not rename the ConveneCore product.

## 4. Staff sign in
Open the site and use **Sign In** with the account issued by your organization. The login page also has **Join an Invited Meeting** for people who only received a meeting link/code.

## 5. Configure organization settings
Administrators open **Settings** to configure:

- organization name and type;
- organization logo;
- address, telephone, email and website;
- motto/tagline and registration/reference number;
- timezone and recording-retention period;
- minutes document title;
- preferred minutes language and style;
- labels for agenda, attendance, proceedings/minutes, decisions/resolutions, action items and transcript appendix.

The initial minutes-style choices are:

- Standard Professional
- Board / Governance
- Corporate / Management
- Project / Action-Oriented
- School / Academic
- NGO / Nonprofit
- Government / Public Sector

The selected organization identity and minutes preferences are used by AI minutes generation and official exports. The style options are an initial global product layer and will continue to be refined using researched real-world conventions.

## 6. Create a meeting
1. Click **New Meeting** from the sidebar, dashboard or Meetings page.
2. Enter the meeting name and date/time.
3. Add agenda/notes if needed.
4. Add participant email addresses if you want the system to email invitations. This is optional.
5. Click **Create Meeting**.
6. The system immediately gives you:
   - **Start Meeting Now**;
   - a shareable invitation link;
   - sharing options;
   - email delivery status when email addresses were entered.

If the meeting is scheduled for later, simply leave the page. Under **Meetings**, every scheduled meeting has a clear **Start Meeting** button.

## 7. Start and end a meeting
1. Open **Meetings** and click **Start Meeting**, or click **Start Meeting Now** immediately after creation.
2. On the Host Meeting screen, click **Start Meeting**.
3. Allow microphone permission in the browser.
4. Keep the page open while the meeting is in progress. The timer shows that recording is active.
5. At the end, click **End Meeting & Generate Minutes**.
6. The recording is uploaded, processed with FFmpeg and Google Gemini, and the system takes you to the meeting while the transcript/minutes are prepared.

If the meeting was recorded on another device, choose **Upload recording instead** on the Host Meeting screen.

## 8. Invitee joining
An invited participant can open the link directly from email or a messaging application. If they only have a code, they can click **Join an Invited Meeting** on the public sign-in page and enter it.

The public join pages show the configured organization identity and a small **Powered by ConveneCore** product attribution. Attendance is recorded without requiring a staff account.

When the live audio room is available, participants can enter it from the meeting room. Full hybrid camera/video support is a planned product phase and should not be treated as completed functionality yet.

## 9. Meeting workspace
After processing, the meeting contains:
- **Overview:** agenda and attendance register.
- **Recording:** authorised playback/download.
- **Transcript:** timestamped speaker turns that authorised editors can correct.
- **Minutes:** generated minutes, key points and decisions that authorised editors can review/edit.
- **Action Items:** responsible person, deadline, priority and status.

A scheduled meeting also keeps a visible **Start Meeting** action so the organizer does not have to hunt for the correct screen.

## 10. AI-generated minutes
ConveneCore supplies the configured organization name/type, minutes style, minutes language and preferred terminology to the Gemini minutes-generation prompt.

The AI must use only facts found in the transcript and must not invent participants, decisions, deadlines or responsibilities. Generated content remains editable before finalization.

## 11. Action items
Use **Action Items** to filter by status, priority, responsible person and deadline. A responsible person can be selected from known people or typed manually even when that person has no system account.

## 12. Official exports
From the meeting workspace choose **PDF** or **Word**. TXT export is also supported by the API.

Official exports use the configured organization identity and terminology, including the selected minutes title and section labels. The transcript appendix starts on a separate page in PDF/DOCX.

## 13. Notifications
The notification bell shows recent completed meetings, failed processing that needs attention and open action items relevant to the current user.

## 14. Settings and system operations
Settings also provides actual Google Gemini model/readiness, SMTP readiness, database/queue status, validated backups and recent audit activity.

## 15. Backups and restore
Administrators can create/download validated backups under Settings. PostgreSQL uses `pg_dump --format=custom`; local SQLite uses its backup API.

Restore is intentionally offline. Stop backend and worker services first, then run:

```bash
python scripts/restore_backup.py storage/backups/<backup-file> --yes
```

## 16. Retention cleanup
Retention cleanup only physically removes old recordings from **archived meetings**. Meeting metadata, transcripts, minutes, decisions and action items are preserved.

## 17. Email configuration
Invitation/final-minutes email requires:
`SMTP_HOST`, `SMTP_PORT`, `SMTP_USERNAME`, `SMTP_PASSWORD`, `SMTP_FROM_EMAIL`, `SMTP_USE_SSL`, `SMTP_USE_STARTTLS`, `SMTP_VERIFY_TLS`.

Meeting email headers use the current organization branding and include ConveneCore product attribution.

## 18. Gemini configuration
Production transcription and structured minutes require `GEMINI_API_KEY`. `GEMINI_MODEL` selects the deployment model. The Settings page reports the effective model/readiness.

## 19. Worldwide deployment scope
The current implementation supports organization-configurable branding and minutes behavior for a deployment/workspace.

A future hosted ConveneCore SaaS serving many unrelated organizations in the same deployment requires a dedicated multi-tenant architecture: tenant/workspace records, tenant-scoped users, meetings and settings, and strict tenant authorization. Do not assume that changing organization settings alone provides tenant isolation.

Some backend scheduling paths still use deployment-level timezone configuration; full workspace-aware timezone behavior remains part of global productization.

## 20. Troubleshooting
- **Microphone does not start:** allow microphone permission in the browser and make sure another application is not exclusively using the microphone.
- **Meeting processing fails:** fix the reported problem and use Retry on the same meeting rather than creating a duplicate.
- **Invitation email does not send:** the link is still usable; copy/share it while SMTP is being fixed.
- **Old organization logo remains after deployment:** refresh/reopen the tab and verify the uploaded branding file under Settings.
- **Old ConveneCore icon remains after deployment:** hard refresh/reopen the installed PWA so browser icon caches update.
- **Backup fails:** verify PostgreSQL client tools are present and the backend can reach the database.

## 21. Security
Keep API keys, SMTP passwords and database passwords in deployment environment variables, not source control. Recording/backup downloads require authorisation; backup creation, audit activity and retention cleanup require administrator access.
