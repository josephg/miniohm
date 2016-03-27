/*

Additive <- Multitive AdditiveSuffix
AdditiveSuffix <- '+' Additive | nothing
Multitive <- Primary MultitiveSuffix
MultitiveSuffix <- '*' Multitive | nothing
Primary <- '(' Additive ')' | Decimal
decimal <- '0' ... '9'

*/

const match = reader => ({r:reader.push(), ok: true});

const max = (a, b) => a > b ? a : b;

function semantics(ruleName, str) {
  //console.log('semantics for', ruleName, 'in', str);
  return str;
}

const rules = {
  additive: r => {
    return r.rule('multitive').rule('additiveSuffix');
  },

  additiveSuffix: r => {
    const r1 = r.push().literal('+').rule('additive');
    if (r1.ok) return r1;
    
    return r; // nothing
  },

  multitive: r => {
    return r.rule('primary').rule('multitiveSuffix');
  },

  multitiveSuffix: r => {
    const r1 = r.push().literal('*').rule('multitive');
    if (r1.ok) return r1;
    
    return r; // nothing
  },

  primary: r => {
    const r1 = r.push()
      .literal('(')
      .rule('additive')
      .literal(')');
    if (r1.ok) return r1;

    return r.rule('decimal');
  },

  decimal: r => {
    const c = r.get(1);
    if (c < '0' || c > '9') {
      r.ok = false;
      r.error = `expected decimal. Got '${c}'`;
    }
    return r;
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

  function makeReader(parent) {
    const startPos = parent ? parent.pos : 0;
    return {
      ok:true,
      parent: parent || null,
      
      // All in absolute positions for now.
      start: startPos,
      pos: startPos, // only relevant if ok=true.
      peeked: startPos,
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
        return makeReader(this);
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

    // We need a new reader here because the one passed in may have done heaps
    // of (for our purposes) unnecessary peeking.
    const childReader = reader.push();
    const result = rule(childReader);

    // We care about:
    // - ok status from result
    // - If ok, final position from result
    // - If error, error message from result
    // - Peek amount from childReader.
    if (result.ok) {
      console.log(`rule ${ruleName} passed consuming '${str.slice(start, result.pos)}' (pos ${start} length ${result.pos - start} peek ${childReader.peeked - start})`);
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


  const rootReader = makeReader(null);

  const finalResult = rootReader.rule(startRule).literal('\x04');
  if (finalResult.ok) {
    console.log('OK!');
  } else {
    console.log('walk failed', finalResult.error);
  }

}

apply('2*(3+4)', 'additive');
//apply('(1+2)*3', 'additive');
//apply('1+2', 'additive');

