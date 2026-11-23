export type StateGroup = Readonly<Record<string, string>>;

export interface StateTexts {
  component: Readonly<Record<string, Readonly<Record<string, StateGroup>>>>;
  entity: Readonly<
    Record<
      string,
      Readonly<
        Record<string, { state?: StateGroup; attributes?: Readonly<Record<string, StateGroup>> }>
      >
    >
  >;
}

export interface StateQuery {
  domain: string;
  state: string;
  deviceClass?: string;
  platform?: string;
  translationKey?: string;
  attribute?: string;
}

function own<T>(
  map: Readonly<Record<string, T>> | undefined,
  key: string | undefined,
): T | undefined {
  if (map === undefined || key === undefined || !Object.hasOwn(map, key)) return undefined;
  return map[key];
}

export function stateText(texts: StateTexts, q: StateQuery): string | undefined {
  const entity = own(own(texts.entity, q.platform), q.translationKey);
  const entityGroup =
    q.attribute === undefined ? entity?.state : own(entity?.attributes, q.attribute);
  const fromEntity = own(entityGroup, q.state);
  if (fromEntity !== undefined) return fromEntity;
  if (q.attribute !== undefined) return undefined;

  const domain = own(texts.component, q.domain);
  return own(own(domain, q.deviceClass), q.state) ?? own(own(domain, "_"), q.state);
}
