import { useEffect } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Link from '@tiptap/extension-link';
import TextAlign from '@tiptap/extension-text-align';
import Placeholder from '@tiptap/extension-placeholder';
import TextStyle from '@tiptap/extension-text-style';
import Color from '@tiptap/extension-color';
import { useState } from 'react';
import {
  Bold, Italic, Underline as UnderlineIcon, List, ListOrdered,
  AlignLeft, AlignCenter, AlignRight, Link2, Link2Off, Palette, X
} from 'lucide-react';
import { cn } from '../../lib/utils';

interface RichTextEditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  className?: string;
}

interface ToolButtonProps {
  onClick: () => void;
  active?: boolean;
  children: React.ReactNode;
  label: string;
}

function ToolButton({ onClick, active, children, label }: ToolButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={cn(
        'rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800',
        'dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100',
        active && 'bg-navy-100 text-navy-800 dark:bg-navy-800 dark:text-gold-300'
      )}
    >
      {children}
    </button>
  );
}

const PRESET_COLORS = [
  '#F0B323', '#ffffff', '#dc2626', '#ea580c', '#16a34a', '#0ea5e9', '#8b5cf6', '#ec4899', '#0f172a'
];

export function RichTextEditor({ value, onChange, placeholder, className }: RichTextEditorProps) {
  const [paletteOpen, setPaletteOpen] = useState(false);
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: false, codeBlock: false, blockquote: false, horizontalRule: false }),
      Underline,
      Link.configure({ openOnClick: false, autolink: true, HTMLAttributes: { rel: 'noopener', target: '_blank' } }),
      TextAlign.configure({ types: ['paragraph'] }),
      Placeholder.configure({ placeholder: placeholder ?? '' }),
      TextStyle,
      Color.configure({ types: ['textStyle'] })
    ],
    content: value || '',
    onUpdate: ({ editor: e }) => {
      onChange(e.isEmpty ? '' : e.getHTML());
    }
  });

  // Keep editor in sync when the form resets with new values
  useEffect(() => {
    if (!editor) return;
    const current = editor.isEmpty ? '' : editor.getHTML();
    if (value !== current) {
      editor.commands.setContent(value || '', false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, editor]);

  if (!editor) return null;

  const setLink = () => {
    const previous = editor.getAttributes('link').href as string | undefined;
    const url = window.prompt('URL', previous ?? 'https://');
    if (url === null) return;
    if (url === '') {
      editor.chain().focus().unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
  };

  return (
    <div
      className={cn(
        'rounded-xl border border-slate-300 bg-white focus-within:border-navy-500 focus-within:ring-2 focus-within:ring-navy-500/20',
        'dark:border-slate-700 dark:bg-slate-900 dark:focus-within:border-gold-400 dark:focus-within:ring-gold-400/20',
        className
      )}
    >
      <div className="flex flex-wrap items-center gap-0.5 border-b border-slate-200 px-2 py-1.5 dark:border-slate-700">
        <ToolButton label="Bold" active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()}>
          <Bold className="h-4 w-4" />
        </ToolButton>
        <ToolButton label="Italic" active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()}>
          <Italic className="h-4 w-4" />
        </ToolButton>
        <ToolButton label="Underline" active={editor.isActive('underline')} onClick={() => editor.chain().focus().toggleUnderline().run()}>
          <UnderlineIcon className="h-4 w-4" />
        </ToolButton>
        <span className="mx-1 h-5 w-px bg-slate-200 dark:bg-slate-700" />
        <ToolButton label="Bullet list" active={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()}>
          <List className="h-4 w-4" />
        </ToolButton>
        <ToolButton label="Numbered list" active={editor.isActive('orderedList')} onClick={() => editor.chain().focus().toggleOrderedList().run()}>
          <ListOrdered className="h-4 w-4" />
        </ToolButton>
        <span className="mx-1 h-5 w-px bg-slate-200 dark:bg-slate-700" />
        <ToolButton label="Align left" active={editor.isActive({ textAlign: 'left' })} onClick={() => editor.chain().focus().setTextAlign('left').run()}>
          <AlignLeft className="h-4 w-4" />
        </ToolButton>
        <ToolButton label="Align center" active={editor.isActive({ textAlign: 'center' })} onClick={() => editor.chain().focus().setTextAlign('center').run()}>
          <AlignCenter className="h-4 w-4" />
        </ToolButton>
        <ToolButton label="Align right" active={editor.isActive({ textAlign: 'right' })} onClick={() => editor.chain().focus().setTextAlign('right').run()}>
          <AlignRight className="h-4 w-4" />
        </ToolButton>
        <span className="mx-1 h-5 w-px bg-slate-200 dark:bg-slate-700" />
        <ToolButton label="Add link" active={editor.isActive('link')} onClick={setLink}>
          <Link2 className="h-4 w-4" />
        </ToolButton>
        <ToolButton label="Remove link" onClick={() => editor.chain().focus().unsetLink().run()}>
          <Link2Off className="h-4 w-4" />
        </ToolButton>
        <span className="mx-1 h-5 w-px bg-slate-200 dark:bg-slate-700" />
        {/* Text color */}
        <div className="relative">
          <ToolButton label="Text color" active={!!editor.getAttributes('textStyle').color} onClick={() => setPaletteOpen((v) => !v)}>
            <span className="flex flex-col items-center">
              <Palette className="h-4 w-4" />
              <span
                className="mt-0.5 block h-1 w-4 rounded-full"
                style={{ backgroundColor: (editor.getAttributes('textStyle').color as string) || '#94a3b8' }}
              />
            </span>
          </ToolButton>
          {paletteOpen && (
            <>
              <div className="fixed inset-0 z-30" onClick={() => setPaletteOpen(false)} />
              <div className="absolute left-0 z-40 mt-1 w-52 animate-scale-in rounded-xl border border-slate-200 bg-white p-3 shadow-xl dark:border-slate-700 dark:bg-slate-900">
                <div className="grid grid-cols-5 gap-1.5">
                  {PRESET_COLORS.map((color) => (
                    <button
                      key={color}
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        editor.chain().focus().setColor(color).run();
                        setPaletteOpen(false);
                      }}
                      className="h-7 w-7 rounded-lg border border-slate-200 transition-transform hover:scale-110 dark:border-slate-600"
                      style={{ backgroundColor: color }}
                      aria-label={color}
                    />
                  ))}
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      editor.chain().focus().unsetColor().run();
                      setPaletteOpen(false);
                    }}
                    className="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 text-slate-400 hover:text-red-500 dark:border-slate-600"
                    title="Reset color"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <label className="mt-2.5 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                  <input
                    type="color"
                    defaultValue={(editor.getAttributes('textStyle').color as string) || '#F0B323'}
                    onChange={(e) => editor.chain().focus().setColor(e.target.value).run()}
                    className="h-7 w-10 cursor-pointer rounded border border-slate-200 dark:border-slate-600"
                  />
                  Color code
                </label>
              </div>
            </>
          )}
        </div>
      </div>
      <EditorContent editor={editor} className="rich-text" />
    </div>
  );
}
