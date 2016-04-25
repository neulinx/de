/*global describe, it */
'use strict'

const chai = require('chai')
const expect = chai.expect
const assert = chai.assert
const should = chai.should()

describe('science', function () {
  it('works', test)
})

function test() {
  expect(true).to.not.equal(false)
  const foo = 'bar'
  const beverages = { tea: ['chai', 'matcha', 'oolong'] }
  assert.typeOf(foo, 'string'); // without optional message
  assert.typeOf(foo, 'string', 'foo is a string'); // with optional message
  assert.equal(foo, 'bar', 'foo equal `bar`');
  assert.lengthOf(foo, 3, 'foo`s value has a length of 3');
  assert.lengthOf(beverages.tea, 3, 'beverages has 3 types of tea');

  expect(foo).to.be.a('string');
  expect(foo).to.equal('bar');
  expect(foo).to.have.length(3);
  expect(beverages).to.have.property('tea').with.length(3);

  foo.should.be.a('string');
  foo.should.equal('bar');
  foo.should.have.length(3);
  beverages.should.have.property('tea').with.length(3);

}