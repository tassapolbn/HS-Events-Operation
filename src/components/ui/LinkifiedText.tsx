import { Fragment } from 'react';
import { linkifyText } from '../../lib/linkify';

/** Plain text with any web address shown as a link that opens in a new tab */
export function LinkifiedText({ text }: { text: string }) {
  return (
    <>
      {linkifyText(text).map((part, index) =>
        part.href ? (
          <a
            key={index}
            href={part.href}
            target="_blank"
            rel="noopener noreferrer"
            // Opens the link, not the card or editor around the text
            onClick={(event) => event.stopPropagation()}
            className="break-all text-navy-500 underline hover:text-navy-700 dark:text-gold-400 dark:hover:text-gold-300"
          >
            {part.text}
          </a>
        ) : (
          <Fragment key={index}>{part.text}</Fragment>
        )
      )}
    </>
  );
}
