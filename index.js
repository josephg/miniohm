///// Realtime document stuff.

// Stolen from sharejs.
var applyChange = function(ctx, oldval, newval) {
  // Strings are immutable and have reference equality. I think this test is O(1), so its worth doing.
  if (oldval === newval) return;

  var commonStart = 0;
  while (oldval.charAt(commonStart) === newval.charAt(commonStart)) {
    commonStart++;
  }

  var commonEnd = 0;
  while (oldval.charAt(oldval.length - 1 - commonEnd) === newval.charAt(newval.length - 1 - commonEnd) &&
      commonEnd + commonStart < oldval.length && commonEnd + commonStart < newval.length) {
    commonEnd++;
  }

  if (oldval.length !== commonStart + commonEnd) {
    ctx.remove(commonStart, oldval.length - commonStart - commonEnd);
  }
  if (newval.length !== commonStart + commonEnd) {
    ctx.insert(commonStart, newval.slice(commonStart, newval.length - commonEnd));
  }
};

function bind(elem) {
  const ctx = {
    content: '',
    get() { return this.content; },
    insert(pos, text) {
      this.content = this.content.slice(0, pos) + text + this.content.slice(pos);
      console.log('insert', text, 'at', pos, '->', this.content);
    },
    remove(pos, amt) {
      const removed = this.content.slice(pos, pos + amt);
      this.content = this.content.slice(0, pos) + this.content.slice(pos + amt);
      console.log('remove', removed, 'at', pos, '->', this.content);
    }
  };

  // important for windows and its funky newlines.
  var prevvalue = elem.value;

  elem.addEventListener('input', (event) => {
    //console.log(elem.value, event);
    if (elem.value !== prevvalue) {
      prevvalue = elem.value;
      applyChange(ctx, ctx.get(), elem.value.replace(/\r\n/g, '\n'));
    }
  }, false);

  return ctx;
}

if (typeof window === 'object') {
  const elem = document.querySelector('textarea')
  const ctx = bind(elem)
  const c = makeCompiler(ctx.content, 'additive')

  const setResult = result => {
    elem.style.backgroundColor = result.ok ? 'white' : '#faa'
  }

  ctx.insert = (pos, text) => {
    ctx.content = c.insert(pos, text)
    setResult(c.evaluate())
  }
  ctx.remove = (pos, amt) => {
    ctx.content = c.remove(pos, amt)
    setResult(c.evaluate())
  }

}
