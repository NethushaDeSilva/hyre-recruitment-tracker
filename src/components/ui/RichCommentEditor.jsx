// Self-hosted TinyMCE (no CDN, no API key) — bundled via Vite the same way
// as every other dependency, matching this app's CSP (script-src 'self').
// Import order matters: model before theme, skin/content BEFORE the Editor
// is used, and init must set skin:false / content_css:false so TinyMCE
// doesn't also try to fetch those over the network — it already has them.
import "tinymce/tinymce";
import "tinymce/models/dom/model";
import "tinymce/themes/silver/theme";
import "tinymce/icons/default/icons";
import "tinymce/plugins/lists/plugin";
import "tinymce/skins/ui/oxide/skin.js";
import "tinymce/skins/ui/oxide/content.js";
import "tinymce/skins/content/default/content.js";
import { Editor } from "@tinymce/tinymce-react";

// The reviewer comment box used when moving a candidate between stages.
// Toolbar is DELIBERATELY limited to bold/italic/bullet+numbered lists —
// nothing else, matching exactly what sanitizeComment()'s strict allowlist
// (src/lib/sanitizeHtml.js) permits to actually be saved. No color,
// highlight, font or size controls: offering a button whose output would
// just be stripped on save is worse than not offering it at all.
// paste_as_text is OFF (paste AS rich text) so bullets/bold/italic copied
// from Word survive the paste — but whatever else Word also pastes in
// (colors, fonts, spans) is still caught by sanitizeComment() on save.
export default function RichCommentEditor({ value, onChange, placeholder, disabled, maxLength = 1000 }) {
  return (
    <div className="rounded-md border border-border focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/15">
      <Editor
        licenseKey="gpl"
        disabled={disabled}
        value={value}
        onEditorChange={(html, editor) => {
          const text = editor.getContent({ format: "text" });
          if (text.length > maxLength) return; // reject the keystroke/paste that would exceed the limit
          onChange(html);
        }}
        init={{
          license_key: "gpl",
          menubar: false,
          statusbar: false,
          toolbar: "bold italic | bullist numlist",
          plugins: "lists",
          placeholder,
          height: 140,
          skin: false,
          content_css: false,
          content_style: "body { font-family: inherit; font-size: 13.5px; padding: 8px 12px; } p { margin: 0 0 6px; }",
          paste_as_text: false,
          paste_block_drop: true,
          branding: false,
          elementpath: false,
        }}
      />
    </div>
  );
}
