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
      console.log('insert', text, 'at', pos);
      this.content = this.content.slice(0, pos) + text + this.content.slice(pos);
    },
    remove(pos, amt) {
      console.log('remove', this.content.slice(pos, amt), 'at', pos);
      this.content = this.content.slice(0, pos) + this.content.slice(pos + amt);
    }
  };

  // important for windows and its funky newlines.
  var prevvalue = elem.value;

  elem.addEventListener('input', (event) => {
    //console.log(elem.value, event);
    // In a timeout so the browser has time to propogate the event's changes to the DOM.
    if (elem.value !== prevvalue) {
      prevvalue = elem.value;
      applyChange(ctx, ctx.get(), elem.value.replace(/\r\n/g, '\n'));
    }
  }, false);

  return ctx;
}

if (typeof window === 'object') {

  bind(document.querySelector('textarea'));
}




//////// PEG stuff

/*

Additive <- Multitive AdditiveSuffix
AdditiveSuffix <- '+' Additive | nothing
Multitive <- Primary MultitiveSuffix
MultitiveSuffix <- '*' Multitive | nothing
Primary <- '(' Additive ')' | Decimal
decimal <- '0' ... '9'

*/

/*
const semantics = {
  decimal: str => +str,
  
};
*/

//const str = _str + '\x04';

const match = reader => ({r:reader.push(), ok: true});

const max = (a, b) => a > b ? a : b;

function semantics(ruleName, str) {
  //console.log('semantics for', ruleName, 'in', str);
  return str;
}

const rules = {
  additive: r => {
    return r.push().rule('multitive').rule('additiveSuffix');
  },

  additiveSuffix: r => {
    const r1 = r.push().literal('+').rule('additive');
    if (r1.ok) return r1;
    
    return r.push(); // nothing
  },

  multitive: r => {
    return r.push().rule('primary').rule('multitiveSuffix');
  },

  multitiveSuffix: r => {
    const r1 = r.push().literal('*').rule('multitive');
    if (r1.ok) return r1;
    
    return r.push(); // nothing
  },

  primary: r => {
    const r1 = r.push()
      .literal('(')
      .rule('additive')
      .literal(')');
    if (r1.ok) return r1;

    return r.push().rule('decimal');
  },

  decimal: r => {
    const r1 = r.push();
    const c = r1.get(1);
    if (c < '0' || c > '9') {
      r1.ok = false;
      r1.error = `expected decimal. Got '${c}'`;
    }
    return r1;
  }
};

function apply(_str, startRule) {
  const str = _str + '\x04';
  const memo = []; // Map from str pos -> rule name -> result.

  const memoGet = (pos, ruleName) => memo[pos] && memo[pos][ruleName];
  const memoSet = (pos, ruleName, result) => {
    if (!memo[pos]) memo[pos] = {};
    memo[pos][ruleName] = result;
  };

  function makeReader(pos, parent) {
    return {
      ok:true,
      parent: parent || null,
      
      // All in absolute positions for now.
      start: pos,
      pos: pos, // only relevant if ok=true.
      peeked: pos,
      error: null,
      
      _peek(pos) { // absolute position.
        this.peeked = max(this.peeked, pos);
        if (this.parent) this.parent._peek(pos); // strictly only necessary if this.peeked changed.
      },
      peek(len) {
        this._peek(this.pos + len);
        return str.slice(this.pos, this.pos + len);
      },

      get(len) {
        const str = this.peek(len);
        this.pos += len;
        return str;
      },

      literal(expect) {
        if (!this.ok) return this;
        const actual = this.peek(expect.length);
        if (actual !== expect) {
          //console.log('literal', expect, actual, this);
          this.ok = false;
          this.error = `at ${this.pos} expected '${expect}' got '${actual}'`;
        }
        this.pos += expect.length;
        return this;
      },

      rule(ruleName) {
        if (!this.ok) return this;
        tryRule(ruleName, this);
        return this;
      },

      push() {
        if (!this.ok) throw Error('push on bad reader');
        return makeReader(this.pos, this);
      }
    };
  }

  function tryRule(ruleName, reader) {
    if (!reader.ok) throw Error('reader not ok');

    const start = reader.pos;
    console.log(`tryRule ${ruleName} at ${start} ('${str.slice(start)}')`);

    const rule = rules[ruleName];
    const memo = memoGet(start, rule);
    if (memo) {
      if (!memo.ok) {
        reader.ok = false;
        reader.error = memo.error;
      }
      reader._peek(memo.peeked);
      reader.pos = memo.end;

      console.log('-> memo!');
      return memo.value;
    }

    // Evaluate.

    const childReader = makeReader(start);
    const result = rule(childReader);
    reader._peek(childReader.peeked);
    if (result.ok) {
      console.log(`rule ${ruleName} passed consuming '${str.slice(start, result.pos)}'`);
      reader.pos = result.pos;
    } else {
      console.log('rule failed:', reader.error);
      reader.ok = false;
      reader.error = result.error;
    }

    if (memoGet(reader.pos, rule)) throw Error('omg');
    memoSet(reader.pos, ruleName, {
      ok: result.ok,
      error: result.error,
      end: reader.pos,
      peeked: childReader.peeked,
      value: semantics(ruleName, str.slice(start, result.pos))
    });
  };


  const rootReader = makeReader(0);

  const finalResult = rootReader.rule(startRule).literal('\x04');
  if (finalResult.ok) {
    console.log('OK!');
  } else {
    console.log('walk failed', finalResult.error);
  }

}

apply('(1+2)*3', 'additive');
//apply('1+2', 'additive');

