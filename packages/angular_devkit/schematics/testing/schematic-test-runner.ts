/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */

import { logging, schema } from '@angular-devkit/core';
import { Observable, from, of as observableOf } from 'rxjs';
import {
  Collection,
  DelegateTree,
  HostTree,
  Rule,
  Schematic,
  SchematicContext,
  SchematicEngine,
  TaskConfiguration,
  Tree,
  formats,
} from '../src';
import { callRule } from '../src/rules/call';
import { BuiltinTaskExecutor } from '../tasks/node';
import { NodeModulesTestEngineHost, validateOptionsWithSchema } from '../tools';

export class UnitTestTree extends DelegateTree {
  get files() {
    const result: string[] = [];
    this.visit((path) => result.push(path));

    return result;
  }

  readContent(path: string): string {
    const buffer = this.read(path);
    if (buffer === null) {
      return '';
    }

    return buffer.toString();
  }
}

export class SchematicTestRunner {
  private _engineHost = new NodeModulesTestEngineHost();
  private _engine: SchematicEngine<{}, {}> = new SchematicEngine(this._engineHost);
  private _collection: Collection<{}, {}>;
  private _logger: logging.Logger;

  constructor(private _collectionName: string, collectionPath: string) {
    this._engineHost.registerCollection(_collectionName, collectionPath);
    this._logger = new logging.Logger('test');

    const registry = new schema.CoreSchemaRegistry(formats.standardFormats);
    registry.addPostTransform(schema.transforms.addUndefinedDefaults);

    this._engineHost.registerOptionsTransform(validateOptionsWithSchema(registry));
    this._engineHost.registerTaskExecutor(BuiltinTaskExecutor.NodePackage);
    this._engineHost.registerTaskExecutor(BuiltinTaskExecutor.RepositoryInitializer);
    this._engineHost.registerTaskExecutor(BuiltinTaskExecutor.RunSchematic);

    this._collection = this._engine.createCollection(this._collectionName);
  }

  get engine() {
    return this._engine;
  }
  get logger(): logging.Logger {
    return this._logger;
  }
  get tasks(): TaskConfiguration[] {
    return [...this._engineHost.tasks];
  }

  registerCollection(collectionName: string, collectionPath: string) {
    this._engineHost.registerCollection(collectionName, collectionPath);
  }

  async runSchematic<SchematicSchemaT extends object>(
    schematicName: string,
    opts?: SchematicSchemaT,
    tree?: Tree,
  ): Promise<UnitTestTree> {
    const schematic = this._collection.createSchematic(schematicName, true);
    const host = observableOf(tree || new HostTree());
    this._engineHost.clearTasks();

    const newTree = await schematic.call(opts || {}, host, { logger: this._logger }).toPromise();

    return new UnitTestTree(newTree);
  }

  /**
   * @deprecated since version 15.1. Use `runSchematic` instead.
   */
  runSchematicAsync<SchematicSchemaT extends object>(
    schematicName: string,
    opts?: SchematicSchemaT,
    tree?: Tree,
  ): Observable<UnitTestTree> {
    return from(this.runSchematic(schematicName, opts, tree));
  }

  async runExternalSchematic<SchematicSchemaT extends object>(
    collectionName: string,
    schematicName: string,
    opts?: SchematicSchemaT,
    tree?: Tree,
  ): Promise<UnitTestTree> {
    const externalCollection = this._engine.createCollection(collectionName);
    const schematic = externalCollection.createSchematic(schematicName, true);
    const host = observableOf(tree || new HostTree());
    this._engineHost.clearTasks();

    const newTree = await schematic.call(opts || {}, host, { logger: this._logger }).toPromise();

    return new UnitTestTree(newTree);
  }

  /**
   * @deprecated since version 15.1. Use `runExternalSchematic` instead.
   */
  runExternalSchematicAsync<SchematicSchemaT extends object>(
    collectionName: string,
    schematicName: string,
    opts?: SchematicSchemaT,
    tree?: Tree,
  ): Observable<UnitTestTree> {
    return from(this.runExternalSchematic(collectionName, schematicName, opts, tree));
  }

  callRule(rule: Rule, tree: Tree, parentContext?: Partial<SchematicContext>): Observable<Tree> {
    const context = this._engine.createContext({} as Schematic<{}, {}>, parentContext);

    return callRule(rule, observableOf(tree), context);
  }
}
