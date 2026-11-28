export type StateGroup = Readonly<Record<string, string>>;

export interface StateWords {
  state?: StateGroup;
  attributes?: Readonly<Record<string, StateGroup>>;
}

export interface StateTexts {
  component: Readonly<Record<string, Readonly<Record<string, StateWords>>>>;
  entity: Readonly<Record<string, Readonly<Record<string, Readonly<Record<string, StateWords>>>>>>;
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

function wordOf(words: StateWords | undefined, q: StateQuery): string | undefined {
  const group = q.attribute === undefined ? words?.state : own(words?.attributes, q.attribute);
  return own(group, q.state);
}

export function stateText(texts: StateTexts, q: StateQuery): string | undefined {
  const entity = own(own(own(texts.entity, q.platform), q.domain), q.translationKey);
  const fromEntity = wordOf(entity, q);
  if (fromEntity !== undefined) return fromEntity;

  const domain = own(texts.component, q.domain);
  return wordOf(own(domain, q.deviceClass), q) ?? wordOf(own(domain, "_"), q);
}
