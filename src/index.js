import fspath from "path";
import _ from 'lodash';

type Plugin = {
  visitor: Visitors
};

type PluginParams = {
  types: Object;
  template: (source: string) => Template;
};

type PluginOptions = {
  aliases?: {
    [key: string]: string|Template;
  };
  strip?: boolean|string|{[key: string]: boolean};
};

type Visitors = {
  [key: string]: Visitor
};

type Template = (ids: TemplateIds) => Node;
type TemplateIds = {[key: string]: Node};

type Visitor = (path: NodePath) => void;

type Node = {
  type: string;
  node?: void;
};

type Literal = {
  type: 'StringLiteral' | 'BooleanLiteral' | 'NumericLiteral' | 'NullLiteral' | 'RegExpLiteral'
};

type Identifier = {
  type: string;
  name: string;
};

type Scope = {};

type NodePath = {
  type: string;
  node: Node;
  scope: Scope;
};

type Metadata = {
  indent: number;
  parentPath: Array<string>;
  filename: string;
  filepath: string;
  hasStartMessage: boolean;
  isStartMessage: boolean;
  line: number;
};

type Level = "error" | "warn" | "info" | "debug" | "trace";

const $handled = Symbol('handled');
const $normalized = Symbol('normalized');

/**
 * # Trace
 */
export default function ({types: t, template}: PluginParams): Plugin {

  const PRESERVE_CONTEXTS = normalizeEnv(process.env.TRACE_CONTEXT);
  const PRESERVE_FILES = normalizeEnv(process.env.TRACE_FILE);
  const PRESERVE_LEVELS = normalizeEnv(process.env.TRACE_LEVEL);

  /**
   * Normalize an environment variable, used to override plugin options.
   */
  function normalizeEnv (input: ?string): string[] {
    if (!input) {
      return [];
    }
    return input.split(/\s*,\s*/)
                .map(context => context.toLowerCase().trim())
                .filter(id => id);
  }

  /**
   * Like `template()` but returns an expression, not an expression statement.
   */
  function expression (input: string): Template {
    const fn: Template = template(input);
    return function (ids: TemplateIds): Node {
      const node: Node = fn(ids);
      return node.expression ? node.expression : node;
    };
  }

  /**
   * Normalize the plugin options.
   */
  function normalizeOpts (opts: PluginOptions): PluginOptions {
    if (opts[$normalized]) {
      return opts;
    }
    if (!opts.aliases) {
      opts.aliases = {};
      ["error", "warn", "info", "debug", "trace"].forEach((level: Level) => {
        opts.aliases[level] = makeNrserLog({level});
        opts.aliases[`${ level }Values`] = makeNrserLog({level});
        opts.aliases[`${ level }Refs`] = makeNrserLog({level, values: false});
      });
    }
    else {
      Object.keys(opts.aliases).forEach(key => {
        if (typeof opts.aliases[key] === 'string' && opts.aliases[key]) {
          const expr: ((message: Message) => Node) = expression(opts.aliases[key]);
          opts.aliases[key] = (message: Message): Node => expr(message);
        }
      });
    }
    opts[$normalized] = true;
    return opts;
  }
  
  function makeNrserLog({
    values = true,
    level
  }) {
    return function (logFunction: string, content: Node, metadata: Metadata) {
      return nrserLog({
        logFunction,
        content,
        metadata,
        values,
        level,
      });
    };
  }
  
  function addIdentifiers(nodes) {
    return {
      ...nodes,
      ..._.fromPairs(
        _.map(nodes, (node, key) => [`${ key }Key`, t.identifier(key)])
      )
    };
  }
  
  function nrserLog ({
    logFunction,
    content,
    metadata,
    values,
    level
  }): Node {
    return expression(`
      ${ logFunction }({
        valuesKey: values,
        levelKey: level,
        filenameKey: filename,
        filepathKey: filepath,
        contentKey: content,
        lineKey: line,
        parentPathKey: parentPath,
      })
    `)(
      addIdentifiers({
        values: t.booleanLiteral(values),
        level: t.stringLiteral(level),
        filename: t.stringLiteral(metadata.filename),
        filepath: t.stringLiteral(metadata.filepath),
        content: t.arrayExpression(
          t.isSequenceExpression(content) ? (
            content.expressions
          ) : (
            [content]
          )
        ),
        line: t.numericLiteral(metadata.line),
        parentPath: t.arrayExpression(
          _.map(metadata.parentPath, (str: string) => t.stringLiteral(str))
        ),
      })
    )
  }
  
  /**
   * Collect the metadata for a given node path, which will be
   * made available to logging functions.
   */
  function collectMetadata (path: NodePath, opts: PluginOptions): Metadata {
    const filename: string = path.hub.file.opts.filename;
    
    const filepath: string = fspath.resolve(
      process.cwd(),
      path.hub.file.opts.filename
    );
    
    const line: number = path.node.loc.start.line;
    
    let indent: number = 0;
    
    let parent: ?NodePath;

    const parentPath: Array<string> = path.getAncestry().slice(1).reduce((parts: string[], item: NodePath) => {
      if (item.isClassMethod()) {
        if (!parent) {
          parent = item;
        }
        parts.unshift(item.node.key.type === 'Identifier' ? item.node.key.name : '[computed method]');
      }
      else if (item.isClassDeclaration()) {
        if (!parent) {
          parent = item;
        }
        parts.unshift(item.node.id ? item.node.id.name : `[anonymous class@${item.node.loc.start.line}]`);
      }
      else if (item.isFunction()) {
        if (!parent) {
          parent = item;
        }
        parts.unshift((item.node.id && item.node.id.name) || `[anonymous@${item.node.loc.start.line}]`);
      }
      else if (item.isProgram()) {
        if (!parent) {
          parent = item;
        }
      }
      else if (!parent && !item.isClassBody() && !item.isBlockStatement()) {
        indent++;
      }
      return parts;
    }, []);

    let hasStartMessage: boolean = false;
    let isStartMessage: boolean = false;
    if (parent && !parent.isProgram()) {
      for (let child: NodePath of parent.get('body').get('body')) {
        if (child.node[$handled]) {
          hasStartMessage = true;
          break;
        }
        if (!child.isLabeledStatement()) {
          break;
        }
        const label: NodePath = child.get('label');
        if (opts.aliases[label.node.name]) {
          hasStartMessage = true;
          if (child.node === path.node) {
            isStartMessage = true;
          }
          break;
        }
      }
    }
    
    return {
      indent,
      parentPath,
      hasStartMessage,
      isStartMessage,
      filename,
      filepath,
      line
    };
  }


  /**
   * Determine whether the given logging statement should be stripped.
   */
  function shouldStrip (
    name: string,
    metadata: Metadata,
    opts: PluginOptions
  ): boolean {
    if (!opts.strip) {
      return false;
    }
    
    if (
      // strip everything
      opts.strip === true ||
          
      // strip only a specific env (such as production)
      (_.isString(opts.strip) && opts.strip === process.env.NODE_ENV) ||
      
      // strip this specific env
      opts.strip[process.env.NODE_ENV] === true
    ) {
      return !hasStripOverride(name, metadata);
    }
    
    return false;
  }

  function hasStripOverride (name: string, metadata: Metadata) {
    if (PRESERVE_CONTEXTS.length && PRESERVE_CONTEXTS.some(context => metadata.context.toLowerCase().indexOf(context) !== -1)) {
      return true;
    }
    else if (PRESERVE_FILES.length && PRESERVE_FILES.some(filename => metadata.filename.toLowerCase().indexOf(filename) !== -1)) {
      return true;
    }
    else if (PRESERVE_LEVELS.length && PRESERVE_LEVELS.some(level => level === name.toLowerCase())) {
      return true;
    }
    else {
      return false;
    }
  }



  return {
    visitor: {
      Program (program: NodePath, {opts}) {
        program.traverse({
          LabeledStatement (path: NodePath): void {
            const label: NodePath = path.get('label');
            opts = normalizeOpts(opts);
            
            if (!opts.aliases[label.node.name]) {
              return;
            }

            const metadata: Metadata = collectMetadata(path, opts);
            if (shouldStrip(label.node.name, metadata, opts)) {
              path.remove();
              return;
            }
            
            const logFunction = opts.logFunction || 'METALOG';

            path.traverse({
              "VariableDeclaration|Function|AssignmentExpression|UpdateExpression|YieldExpression|ReturnStatement" (item: NodePath): void {
                throw path.buildCodeFrameError(`Logging statements cannot have side effects.`);
              },
              ExpressionStatement (statement: NodePath): void {
                if (statement.node[$handled]) {
                  return;
                }
                // const message: Message = {
                //   content: statement.get('expression').node,
                //   hasStartMessage: t.booleanLiteral(metadata.hasStartMessage),
                //   isStartMessage: t.booleanLiteral(metadata.isStartMessage),
                //   indent: t.numericLiteral(metadata.indent),
                //   parentName: t.stringLiteral(metadata.parentName),
                //   filename: t.stringLiteral(metadata.filename),
                //   filepath: t.stringLiteral(metadata.filepath),
                // };
                const content: Node = statement.get('expression').node;
                const replacement = t.expressionStatement(
                  opts.aliases[label.node.name](logFunction, content, metadata)
                );
                replacement[$handled] = true;
                statement.replaceWith(replacement);
              }
            });

            if (path.get('body').isBlockStatement()) {
              path.replaceWithMultiple(path.get('body').node.body);
            }
            else {
              path.replaceWith(path.get('body').node);
            }
          }
        });
      }

    }
  };
}
