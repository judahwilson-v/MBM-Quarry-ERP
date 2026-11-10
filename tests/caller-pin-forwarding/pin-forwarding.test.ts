import {it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import ts from 'typescript';

// Caller PIN-forwarding unit (QA-flagged, PREEXISTING in baseline): the full edit
// forms verified the PIN client-side but never forwarded it, so the server refused
// every correct-PIN edit (sale form) or the refusal was ignored (boulder form,
// green "updated" while the DB stayed unchanged). AST contracts, not browser
// tests; actual-UI evidence belongs to independent QA.

function sourceFile(path:string){const text=readFileSync(path,'utf8');return {text,source:ts.createSourceFile(path,text,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX)};}

function callsNamed(source:ts.SourceFile,names:string[]){
 const found:{node:ts.CallExpression;inSubmit:boolean}[]=[];
 function visit(node:ts.Node,inSubmit:boolean){
  let s=inSubmit;
  if((ts.isFunctionDeclaration(node)||ts.isFunctionExpression(node)||ts.isArrowFunction(node))){
   const name=(node as ts.FunctionDeclaration).name?.getText(source);
   if(name==='submit')s=true;
  }
  if(ts.isCallExpression(node)&&ts.isIdentifier(node.expression)&&names.includes(node.expression.text))found.push({node,inSubmit:s});
  ts.forEachChild(node,(c)=>visit(c,s));
 }
 visit(source,false);
 return found;
}

it('sale full edit form forwards the verified edit PIN to saveSale (server stays the auth boundary)',()=>{
 const {source}=sourceFile('src/components/modules/sales-entry-form.tsx');
 const calls=callsNamed(source,['saveSale']);
 expect(calls).toHaveLength(1);
 const args=calls[0].node.arguments;
 // Three arguments: the input object, the PIN variable, AND the login session
 // token (FULL53: money mutations carry the server-validated session).
 expect(args).toHaveLength(3);
 expect(args[1].getText(source)).toBe('editPin');
 expect(args[2].getText(source)).toContain('getSessionToken');
 // editPin is assigned the prompted+verified password inside the edit (form.id) guard.
 const fn=args[1];
 void fn;
 const text=source.getFullText();
 const guardIdx=text.indexOf('if (form.id)');
 expect(guardIdx).toBeGreaterThanOrEqual(0);
 const guardBlock=text.slice(guardIdx,guardIdx+500);
 expect(guardBlock).toContain('promptPassword');
 expect(guardBlock).toContain('verifyEditPassword');
 expect(guardBlock).toMatch(/editPin\s*=\s*password/);
});

it('boulder full edit form forwards the edit PIN and checks the returned failure before announcing success',()=>{
 const {text,source}=sourceFile('src/components/modules/boulder-purchases-page.tsx');
 const calls=callsNamed(source,['saveIncomingBoulder']);
 // The full-form submit must call it with (form, pin).
 const formCalls=calls.filter(c=>c.inSubmit&&c.node.arguments[0]?.getText(source)==='form');
 expect(formCalls.length).toBe(1);
 // (form, pin, sessionToken) - PIN at position 1, session token at position 2.
 expect(formCalls[0].node.arguments).toHaveLength(3);
 expect(formCalls[0].node.arguments[2].getText(source)).toContain('getSessionToken');
 // The result must be captured and checked for a refusal BEFORE any success message.
 const callStart=formCalls[0].node.getStart(source);
 const assign=text.slice(Math.max(0,callStart-80),callStart);
 expect(assign).toMatch(/(const|let)\s+res\s*=\s*await\s*$/);
 const after=text.slice(callStart,callStart+600);
 const failCheck=after.search(/'error' in res|res\.success\s*===\s*false|res\?\.success\s*===\s*false/);
 const successMsg=after.indexOf('setMessage(');
 expect(failCheck).toBeGreaterThanOrEqual(0);
 expect(successMsg).toBeGreaterThan(failCheck);
 // The edit path obtains the PIN through the same verified requestEditPin helper.
 const submitStart=text.lastIndexOf('async function submit',callStart);
 expect(submitStart).toBeGreaterThanOrEqual(0);
 expect(text.slice(submitStart,callStart)).toContain('requestEditPin()');
});

it('inline cell editors already forward the PIN (characterization of the correct existing shape)',()=>{
 for(const path of ['src/components/modules/sales-page.tsx','src/components/modules/boulder-purchases-page.tsx']){
  const {source}=sourceFile(path);
  const names=path.includes('sales')?['saveSale']:['saveIncomingBoulder'];
  const inline=callsNamed(source,names).filter(c=>c.node.arguments.length===3&&c.node.arguments[2].getText(source).includes('getSessionToken'));
  expect(inline.length,`${path} has a PIN-and-session-forwarding inline call`).toBeGreaterThanOrEqual(1);
 }
});
