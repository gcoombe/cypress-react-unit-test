/// <reference types="cypress" />
/// <reference types="../../lib" />

import React from 'react'
import * as ReactDOM from 'react-dom'
import CounterWithHooks from '../../src/counter-with-hooks.jsx'

/* eslint-env mocha */
describe('CounterWithHooks component', function () {

  beforeEach(() => {
    // We need the support file to be using the same ReactDOM instance as the spec file for hooks to work
    cy.on('window:load', (win) => {
      win.ReactDOM = ReactDOM
    })
  })


  it('works', function () {
    cy.mount(<CounterWithHooks initialCount={3} />)
    cy.contains('3')
  })
})
