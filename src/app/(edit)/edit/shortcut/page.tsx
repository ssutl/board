import { hasSession } from "@/lib/auth/requireSession";
import { SignInPrompt } from "../SignInPrompt";
import { ShortcutKey } from "./ShortcutKey";

export default async function ShortcutPage() {
  if (!(await hasSession())) return <SignInPrompt />;
  return (
    <div className="max-w-xl space-y-6 text-sm">
      <h1 className="text-lg font-semibold">Apple Shortcut</h1>
      <ShortcutKey />
      <ol className="list-decimal space-y-3 pl-5">
        <li>
          Open <strong>Shortcuts</strong> on your iPhone, then tap <strong>+</strong> and name it <strong>Add to Board</strong>.
        </li>
        <li>
          Tap the <strong>ⓘ</strong> details: turn on <strong>Show in Share Sheet</strong>, and set it to receive <strong>Images</strong>, <strong>URLs</strong> and <strong>Safari web pages</strong> (turn the rest off).
        </li>
        <li>
          Add <strong>If</strong> <em>Shortcut Input</em> <strong>has any value</strong> of type Image → inside it add <strong>Convert Image</strong> to <strong>JPEG</strong>, then <strong>Resize Image</strong> to width <strong>2000</strong> (Auto height). Otherwise leave the input as it is.
        </li>
        <li>
          Add <strong>Get Contents of URL</strong>. URL: <code>https://board.ssutl.com/api/drop</code>. Method <strong>POST</strong>. Header <code>Authorization</code> = <code>Bearer &lt;your key&gt;</code>. Request Body <strong>Form</strong>, with one field <code>input</code> = the <em>If Result</em> (type File for images, Text for links).
        </li>
        <li>
          Add <strong>Show Notification</strong>: <em>Saved</em>.
        </li>
        <li>Try it: take a screenshot, tap Share, then Add to Board. It appears in the inbox here in a second.</li>
      </ol>
      <p className="text-muted">The same Shortcut syncs to your Mac through iCloud and shows up in the Mac share menu.</p>
    </div>
  );
}
