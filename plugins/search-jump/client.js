window.__ModuleLoader__.load({
  id: '@local/search-jump',
  factory() {
    const HIGHLIGHT = 'local-search-jump';
    const MAX_MS = 20000;
    const HOLD_MS = 6000;
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    let run = 0;
    let clearTimer;

    // Collapse whitespace and lower-case, keeping a map from each kept character back to its text node.
    function indexText(root) {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      let text = '';
      const map = [];
      let lastSpace = true;
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const value = node.nodeValue;
        for (let i = 0; i < value.length; i++) {
          const space = /\s/.test(value[i]);
          if (space && lastSpace) continue;
          text += space ? ' ' : value[i].toLowerCase();
          map.push([node, i]);
          lastSpace = space;
        }
      }
      return { text, map };
    }
    const normalize = (value) => value.replace(/\s+/g, ' ').trim().toLowerCase();

    // Search phrases from most to least specific: the typed query, its opening words, then the result snippet.
    function candidates(query, snippet) {
      const list = [];
      const q = normalize(query);
      if (q) list.push(q);
      if (q.length > 60) list.push(q.slice(0, 60).trim());
      const parts = normalize(snippet).split(/…|\.\.\./).map((part) => part.trim()).filter((part) => part.length >= 4);
      parts.sort((a, b) => b.length - a.length);
      if (parts[0]) list.push(parts[0].slice(0, 60).trim());
      return [...new Set(list)];
    }

    function findRange(column, phrases) {
      const { text, map } = indexText(column);
      for (const phrase of phrases) {
        const at = text.lastIndexOf(phrase);
        if (at === -1) continue;
        const [startNode, startOffset] = map[at];
        const [endNode, endOffset] = map[at + phrase.length - 1];
        const range = document.createRange();
        range.setStart(startNode, startOffset);
        range.setEnd(endNode, endOffset + 1);
        return range;
      }
      return null;
    }

    function reveal(scroller, range) {
      const box = range.getBoundingClientRect();
      const frame = scroller.getBoundingClientRect();
      scroller.scrollTop += box.top - frame.top - scroller.clientHeight / 2 + box.height / 2;
      if (typeof Highlight === 'function' && CSS.highlights) {
        CSS.highlights.set(HIGHLIGHT, new Highlight(range));
        clearTimeout(clearTimer);
        clearTimer = setTimeout(() => CSS.highlights.delete(HIGHLIGHT), HOLD_MS);
      }
    }

    async function seek(query, snippet) {
      const id = ++run;
      const phrases = candidates(query, snippet);
      if (phrases.length === 0) return;
      const started = Date.now();
      await sleep(400);
      let stuck = 0;
      while (id === run && Date.now() - started < MAX_MS) {
        const column = document.querySelector('[data-chat-flow]');
        const scroller = column?.parentElement;
        if (!column || !scroller) { await sleep(150); continue; }
        const range = findRange(column, phrases);
        if (range) {
          reveal(scroller, range);
          await sleep(300);
          // The transcript may re-measure after the jump; re-centre once on fresh layout.
          const again = id === run && findRange(column, phrases);
          if (again) reveal(scroller, again);
          return;
        }
        const before = scroller.scrollTop;
        const height = scroller.scrollHeight;
        scroller.scrollTop = Math.max(0, before - scroller.clientHeight * 0.8);
        await sleep(250);
        if (before === 0 && scroller.scrollHeight === height) {
          // At the top with nothing older loading: wait a little longer, then give up.
          if (++stuck >= 8) return;
          await sleep(250);
        } else {
          stuck = 0;
        }
      }
    }

    function onClick(event) {
      const row = event.target instanceof Element ? event.target.closest('[class*="_searchResultRow"]') : null;
      if (!row) return;
      const input = document.querySelector('input[class*="_searchInput"], [class*="_searchInput"] input, [class*="_search"] input');
      const query = input?.value ?? '';
      const snippet = row.querySelector('[class*="_searchResultSnippet"]')?.textContent ?? '';
      void seek(query, snippet);
    }

    return {
      apply(ctx) {
        ctx.effect(() => {
          const style = document.createElement('style');
          style.id = 'local-search-jump';
          style.textContent = `::highlight(${HIGHLIGHT}) { background-color: #e0af6880; color: inherit; }`;
          document.head.appendChild(style);
          document.addEventListener('click', onClick, true);
          return () => {
            run++;
            document.removeEventListener('click', onClick, true);
            if (CSS.highlights) CSS.highlights.delete(HIGHLIGHT);
            style.remove();
          };
        }, 'search-jump: scroll to search match');
      },
    };
  },
});
