import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

// Merge rigid accessories within one joint. Articulated limbs and wheels stay
// separate, so reducing draw calls never removes an animation degree of freedom.
export function batchStaticMeshes(parent,exclude=new Set(),hitMeshes=[]){
  const groups=new Map();
  for(const node of parent.children){
    if(!node.isMesh||exclude.has(node)||node.children.length||Array.isArray(node.material))continue;
    const siblings=groups.get(node.material)??[];siblings.push(node);groups.set(node.material,siblings);
  }
  for(const [material,nodes] of groups){
    if(nodes.length<2)continue;
    const geometries=nodes.map(node=>{
      node.updateMatrix();const g=node.geometry.clone().applyMatrix4(node.matrix),flat=g.index?g.toNonIndexed():g;
      if(!material.map)flat.deleteAttribute('uv');return flat;
    });
    const geometry=mergeGeometries(geometries);
    if(!geometry)throw new Error('Accessory geometry attributes do not match');
    const merged=new THREE.Mesh(geometry,material);merged.name='batched-rigid-accessories';merged.castShadow=true;merged.receiveShadow=true;
    parent.add(merged);
    for(const node of nodes){parent.remove(node);const i=hitMeshes.indexOf(node);if(i>=0)hitMeshes.splice(i,1);}
    hitMeshes.push(merged);
  }
}
