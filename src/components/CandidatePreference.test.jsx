import React from 'react';
import { act, create } from 'react-test-renderer';
import { expect, it, vi } from 'vitest';
import OtherApplications from './OtherApplications';
const mocks=vi.hoisted(()=>({save:vi.fn(async()=>{}),candidates:[],positions:[]}));
vi.mock('@/data/store',()=>({useHyreData:()=>({candidates:mocks.candidates,positions:mocks.positions}),getOtherActiveApplications:async()=>[{id:'b',positionTitle:'Manager',stage:'applied'}],recordCandidatePreference:(...a)=>mocks.save(...a),subscribeCandidatePreferences:()=>()=>{}}));
vi.mock('@/context/AuthContext',()=>({useAuth:()=>({user:{uid:'hr',role:'HR'}})}));
vi.mock('@/components/ui/Modal',()=>({Modal:({open,children,footer})=>open?<div>{children}{footer}</div>:null}));
it('records an undecided choice without requiring a note or score',async()=>{
 let tree;await act(async()=>{tree=create(<OtherApplications candidate={{id:'a',personId:'p',positionId:'p1',stage:'screening'}} positionTitle="Developer"/>);});
 const button=label=>tree.root.findAllByType('button').find(b=>b.children.join('').includes(label));
 act(()=>button('Record candidate').props.onClick());
 expect(tree.root.findAllByType('input').every(n=>n.props.type==='radio')).toBe(true);
 await act(async()=>{await button('Confirm choice').props.onClick();});
 expect(mocks.save).toHaveBeenCalledWith('a',['a','b'],expect.objectContaining({choice:'undecided',note:''}));
 act(()=>tree.unmount());
});
