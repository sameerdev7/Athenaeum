import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/**
 * Journal markdown, full CommonMark + GitHub-flavoured: headings, emphasis,
 * ~~strikethrough~~, links and bare URLs, images, nested lists, task lists,
 * tables, block quotes, inline and fenced code, rules, footnotes and hard
 * line breaks.
 *
 * Raw HTML is deliberately NOT rendered: react-markdown builds React elements
 * and escapes embedded HTML, and it filters `javascript:` style URLs, so user
 * text can't inject markup or script.
 */

// The page title is the h1, so body headings are shifted down one level.
const heading = (level) =>
  function Heading({ node: _node, ...props }) {
    const Tag = `h${Math.min(level + 1, 4)}`;
    return <Tag {...props} />;
  };

const components = {
  h1: heading(1),
  h2: heading(2),
  h3: heading(3),
  h4: heading(4),
  h5: heading(5),
  h6: heading(6),
  a({ node: _node, href, children, ...props }) {
    // Footnote jumps stay in-page; everything else opens safely in a new tab.
    const internal = href?.startsWith("#");
    return (
      <a
        href={href}
        {...(internal ? {} : { target: "_blank", rel: "noopener noreferrer" })}
        {...props}
      >
        {children}
      </a>
    );
  },
  img({ node: _node, alt, ...props }) {
    return <img loading="lazy" alt={alt ?? ""} {...props} />;
  },
  table({ node: _node, children }) {
    return (
      <div className="table-wrap">
        <table>{children}</table>
      </div>
    );
  },
  pre({ node: _node, children }) {
    const lang = children?.props?.className?.replace("language-", "");
    return (
      <pre data-lang={lang || undefined}>{children}</pre>
    );
  },
};

export default function Markdown({ source, className = "" }) {
  return (
    <div className={`prose-journal ${className}`}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {source ?? ""}
      </ReactMarkdown>
    </div>
  );
}
