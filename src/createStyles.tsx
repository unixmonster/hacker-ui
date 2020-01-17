// @pragma export
import React, { forwardRef, useMemo, useLayoutEffect } from 'react';
import classNames from 'classnames';
import shortId from 'shortid';
import stylis from 'stylis';
import css from './css';
import { DynamicColorPalette, Theme, PropsOf } from './types';
import useTheme from './useTheme';
import createDynamicColorPalette from './createDynamicColorPalette';
import tryGetCurrentFileName from './tryGetCurrentFileName';

export interface PropsFromStyles<UseStylesFn> {
  on?: string;
  color?: string;
  style?: React.CSSProperties;
  styles?: Partial<GetStyleObj<UseStylesFn>>;
  className?: string;
  component?: ReactComponent;
}

type ReactComponent =
  | React.ComponentType<any>
  | keyof JSX.IntrinsicElements
  | string;

export interface StyleProps<StylesObj> {
  on?: string;
  color?: string;
  style?: React.CSSProperties;
  styles?: Partial<StylesObj>;
  className?: string;
  component?: ReactComponent;
}

export type OmitStyleProps<T> = Omit<T, keyof StyleProps<any>>;
export type PropsFromComponent<
  T extends React.ComponentType<any>
> = OmitStyleProps<PropsOf<T>>;

type GetStyleObj<UseStylesFn> = UseStylesFn extends (props: {
  styles: Partial<infer U>;
}) => any
  ? U
  : never;

type GetComponentProps<
  ComponentType extends ReactComponent
> = ComponentType extends React.ComponentType<infer U>
  ? U
  : ComponentType extends keyof JSX.IntrinsicElements
  ? JSX.IntrinsicElements[ComponentType]
  : any;

function hashStyleObj(styleObj: { [key: string]: string | undefined }) {
  return Object.keys(styleObj)
    .map(key => `${key}_${styleObj[key]}`)
    .join('__|__');
}

// preserve the object reference
const empty = {};

// for some reason, typescript doesn't let these be inline
type StyleFnArgs = {
  css: typeof css;
  color: DynamicColorPalette;
  theme: Theme;
};

function createStyles<Styles extends { [key: string]: string }>(
  stylesFn: (args: StyleFnArgs) => Styles,
) {
  const sheetId = shortId();
  const fileName = tryGetCurrentFileName();

  // TODO: possibly delay this side effect until component mount?
  const sheetEl = document.createElement('style');
  sheetEl.dataset.hackerUi = 'true';
  sheetEl.id = sheetId;
  document.head.appendChild(sheetEl);

  function useStyles<
    Props extends StyleProps<Styles>,
    ComponentType extends ReactComponent = 'div'
  >(
    props: Props = {} as any,
    component?: ComponentType,
  ): Omit<
    Props,
    'on' | 'color' | 'style' | 'styles' | 'className' | 'component'
  > & {
    Root: React.ComponentType<GetComponentProps<ComponentType>>;
    styles: Styles;
  } {
    const theme = useTheme();
    const {
      color = theme.colors.brand,
      on = theme.colors.surface,
      style: incomingStyle,
      className: incomingClassName,
      styles: incomingStyles = empty as Styles,
      component: incomingComponent,
      ...restOfProps
    } = props;

    const incomingStyleHash = hashStyleObj(incomingStyles);

    // create a map of unprocessed styles
    const unprocessedStyles = useMemo(() => {
      const dynamicColors = createDynamicColorPalette(color, on);
      return stylesFn({ css, color: dynamicColors, theme });
    }, [color, on, theme]);

    const styleId = useMemo(shortId, [unprocessedStyles]);

    // calculate the class names
    const thisStyles = useMemo(() => {
      return Object.keys(unprocessedStyles)
        .map(key => [
          key,
          // the replace is ensure the class name only uses css safe characters
          `${fileName || 'hui'}_${key}_${sheetId}_${styleId}`.replace(
            /[^a-z0-9-_]/gi,
            '',
          ),
        ])
        .reduce((acc, [key, className]) => {
          acc[key as keyof Styles] = className as Styles[keyof Styles];
          return acc;
        }, {} as Styles);
    }, [styleId, unprocessedStyles]);

    // mount the styles to the dom
    useLayoutEffect(() => {
      const keys = Object.keys(thisStyles);

      const processedSheet = keys
        .map(key => {
          const className = thisStyles[key];
          const unprocessedStyle = unprocessedStyles[key];

          const processedStyle: string = stylis(
            `.${className}`,
            unprocessedStyle,
          );

          return processedStyle;
        })
        .join('\n\n');

      sheetEl.innerHTML += processedSheet;
    }, [thisStyles, unprocessedStyles]);

    const mergedStyles = useMemo(() => {
      const thisStyleKeys = Object.keys(thisStyles) as Array<keyof Styles>;

      return thisStyleKeys.reduce((merged, key) => {
        const thisStyle = thisStyles[key];
        const incomingStyle = incomingStyles[key];

        merged[key] = classNames(
          thisStyle,
          incomingStyle,
        ) as Styles[keyof Styles];

        return merged;
      }, {} as Styles);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [thisStyles, incomingStyleHash]);

    const Component = (component ||
      incomingComponent ||
      'div') as React.ComponentType<any>;

    const Root = useMemo(() => {
      return forwardRef((rootProps: StyleProps<Styles>, ref: any) => {
        const { className: rootClassName, style: rootStyles } = rootProps;

        return (
          <Component
            {...rootProps}
            ref={ref}
            className={classNames(
              mergedStyles.root,
              rootClassName,
              incomingClassName,
            )}
            style={{
              ...rootStyles,
              ...incomingStyle,
            }}
          />
        );
      }) as React.ComponentType<GetComponentProps<ComponentType>>;
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [incomingClassName, incomingStyleHash, mergedStyles.root]);

    return {
      Root,
      styles: mergedStyles,
      ...restOfProps,
    };
  }

  return useStyles;
}

export default createStyles;
