import { redirect } from "next/navigation";

export default function LegacyRecordMeetingPage() {
  redirect("/create-meeting");
}
