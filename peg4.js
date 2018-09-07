// const assert = require('assert')
const assert = v => { if (!v) throw Error('Assertion failed') }
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
  additive: r => r.rule('multitive').rule('additiveSuffix'),

  additiveSuffix: r => r.optional(r => r.literal('+').rule('additive')),

  multitive: r => r.rule('primary').rule('multitiveSuffix'),

  multitiveSuffix: r => r.optional(r => r.literal('*').rule('multitive')),

  primary: r => r.or(
    r => r.literal('(').rule('additive').literal(')'),
    r => r.rule('decimal')
  ),

  decimal: r => {
    const c = r.get(1);
    if (c < '0' || c > '9') {
      r.ok = false;
      r.error = `expected decimal. Got '${c}'`;
    }
    while (true) {
      const c = r.peek(1)
      if (!r.ok || c < '0' || c > '9') break
      r.get(1)
    }

    return r;
  }
}

/*
const reducers = {
  additive: 

  additiveSuffix: (

  primary: [
    (lparen, val, rparen) => val
    decimal => decimal
  ],

  decimal: str => +str
}*/

class IntervalTreeMock {
  // entries: Interval[]
  constructor(entries = []) {
    this.entries = entries.slice()
  }

  addInterval(a, b, data) {
    this.entries.push(data === undefined ? [a, b] : [a, b, data])
  }

  *queryPoint(p, sort = false) {
    const results = []
    this.entries.forEach(i => {
      if (p >= i[0] && p < i[1]) results.push(i)
    })
    yield *results.sort(sortCmp)
  }

  widenAndInvalidate(p, amt = 1) {
    assert(amt >= 0)
    for (let k = 0; k < this.entries.length; k++) {
      let i = this.entries[k]
      if (i[0] >= p) { i[0] += amt; i[1] += amt }
      else if (i[1] > p) {
        console.log('invalidating', i)
        // yield i
        this.entries[k] = this.entries[this.entries.length-1]
        this.entries.length--
        k--
      } // else ignore.
    }
  }
  shrinkAndInvalidate(start, amt = 1) {
    assert(amt >= 0)

    const end = start + amt
    for (let k = 0; k < this.entries.length; k++) {
      let i = this.entries[k]
      if (i[0] >= end) { i[0] -= amt; i[1] -= amt }
      else if (start < i[1]) {
        // yield i
        this.entries[k] = this.entries[this.entries.length-1]
        this.entries.length--
        k--
      } // else ignore.
    }
  }

  get(pos) {
    for (let k = 0; k < this.entries.length; k++) {
      let i = this.entries[k]
      if (i[0] === pos) return i
    }
  }
}

const makeCompiler = (_str, startRule) => {
  let str = _str //+ '\x04';
  const memo = {}; // Map from rule name -> interval tree -> result.

  const memoGet = (ruleName, start) => memo[ruleName] && memo[ruleName].get(start);
  const memoSet = (ruleName, start, end, result) => {
    if (!memo[ruleName]) memo[ruleName] = new IntervalTreeMock;
    memo[ruleName].addInterval(start, end, result)
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
        if (pos > this.peeked) {
          this.peeked = pos
          if (this.parent) this.parent._peek(pos)
        }
      },
      peek(len) {
        this._peek(this.pos + len);
        return str.slice(this.pos, this.pos + len)
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
        assert(this.ok, 'push on bad reader')
        return makeReader(this);
      },

      optional(fn) {
        const r1 = fn(this.push())
        return r1.ok ? r1 : this
      },

      or(opt1, opt2) { // TODO: this should probably be varadic.
        const r1 = opt1(this.push())
        return r1.ok ? r1 : opt2(this)
      },
    };
  }

  function tryRule(ruleName, reader) {
    assert(reader.ok, 'reader not ok')

    const start = reader.pos;
    console.log(`tryRule ${ruleName} at ${start} ('${str.slice(start)}')`);

    const rule = rules[ruleName];
    const memo = memoGet(ruleName, start);
    // console.log('memo', start, ruleName, !!memo)
    if (memo) {
      const [base, peeked, {ok, error, len, value}] = memo
      if (!ok) {
        reader.ok = false
        reader.error = error
      }
      reader._peek(peeked);
      reader.pos = base + len

      console.log(`-> from memo! (ok=${ok}, end=${base+len} peeked=${peeked} content=${str.slice(start, base+len)})`);
      return //memo.value;
    }

    // Evaluate.

    // We need a new reader here to isolate the read start & peeking for
    // memoization
    const childReader = reader.push()
    const result = rule(childReader)

    // We care about:
    // - ok status from result
    // - If ok, final position from result
    // - If error, error message from result
    // - Peek amount from childReader.
    if (result.ok) {
      const peek = childReader.peeked - result.pos
      console.log(`rule ${ruleName} passed consuming '${str.slice(start, result.pos)}' (pos ${start} length ${result.pos - start}${peek ? ` + peek ${peek}` : ''})`);
      reader.pos = result.pos;
    } else {
      console.log('rule failed:', reader.error);
      reader.ok = false;
      reader.error = result.error;
    }

    assert(memoGet(reader.start, rule) == null)
    assert(reader.pos >= reader.start)
    memoSet(ruleName, reader.start, childReader.peeked, {
      ok: result.ok,
      error: result.error,
      len: reader.pos - reader.start,
      value: semantics(ruleName, str.slice(start, result.pos))
    });
  };

  return {
    evaluate() {
      const result = makeReader(null).rule(startRule)//.literal('\x04');
      if (result.ok && result.pos !== str.length) {
        console.log('pos', result.pos, str.length)
        result.ok = false
        result.error = `Unexpected suffix '${str.slice(result.pos)}'`
      }

      if (result.ok) {
        console.log('OK!');
      } else {
        console.log('walk failed', result.error);
      }

      console.log(Object.keys(memo).map(k => [k, memo[k].entries]))
      return result
    },

    insert(pos, text) {
      // console.log('ins <<', str, pos, text)
      str = str.slice(0, pos) + text + str.slice(pos)
      console.log('ins ->', str)
      for (let k in memo) memo[k].widenAndInvalidate(pos, text.length)
      return str
    },

    remove(pos, amt) {
      // console.log('del <<', str, pos, amt)
      str = str.slice(0, pos) + str.slice(pos + amt)
      console.log('del ->', str)
      for (let k in memo) memo[k].shrinkAndInvalidate(pos, amt)
      return str
    }
  }
  // if (finalResult.ok) {
  //   console.log('OK!');
  // } else {
  //   console.log('walk failed', finalResult.error);
  // }

  // console.log(memo)

  // {
  //   const rootReader = makeReader(null);

  //   const finalResult = rootReader.rule(startRule).literal('\x04');
  //   console.log(finalResult)
  // }

}

// apply('2*(3+4)', 'additive');
// const c = makeCompiler('2*(3+4)', 'additive')
// c.evaluate()
// c.evaluate()
//apply('(1+2)*3', 'additive');
//apply('1+2', 'additive');

