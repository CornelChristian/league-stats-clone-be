import Database from '@ioc:Adonis/Lucid/Database'
import SummonerMatchlist from 'App/Models/SummonerMatchlist'

export interface SelectFilters {
  puuid: string
  season?: number
  limit?: number
  queue?: number
  lastMatchId?: string
}

class MatchRepository {
  private readonly JOIN_MATCHES = 'INNER JOIN matches ON matches.id = match_players.match_id'

  private globalFilters(filters: SelectFilters) {
    let query = `
    match_players.summoner_puuid = :puuid
    AND match_players.remake = 0
    AND (
      (matches.gamemode < 800 OR matches.gamemode > 899)
        AND
      (matches.gamemode < 2000 OR matches.gamemode > 2999)
    )
    `

    if (filters.season) query += ' AND matches.season = :season '
    if (filters.queue) query += ' AND matches.gamemode = :queue '

    return query
  }

  /**
   * Get the list of matchIds from the next matches to fetch for a specific Summoner
   */
  public async getNextMatchIds(filters: SelectFilters) {
    const matchListQuery = SummonerMatchlist.query()
      .select('matchId')
      .where('summoner_puuid', filters.puuid)
      .andWhere('useful', true)

    if (filters.lastMatchId) {
      matchListQuery.andWhere('match_id', '<', filters.lastMatchId)
    }

    if (filters.season) {
      matchListQuery
        .join('matches', 'summoner_matchlist.match_id', 'matches.id')
        .where('matches.season', filters.season)
    }

    const limit = filters.limit ?? 10

    const matchlist = await matchListQuery.orderBy('matchId', 'desc').limit(limit)
    return matchlist.map((m) => m.matchId)
  }

  public async gamemodes(puuid: string) {
    const query = `
    SELECT DISTINCT
        matches.gamemode
    FROM
        match_players
        ${this.JOIN_MATCHES}
    WHERE
        match_players.summoner_puuid = :puuid
    `
    const { rows } = await Database.rawQuery(query, { puuid })
    return rows
  }

  public async seasons(puuid: string) {
    const query = `
    SELECT DISTINCT
        matches.season
    FROM
        match_players
        ${this.JOIN_MATCHES}
    WHERE
        match_players.summoner_puuid = :puuid
    `
    const { rows } = await Database.rawQuery(query, { puuid })
    return rows
  }

  public async recentActivity(puuid: string) {
    console.time('RECENT_ACTIVITY')
    const query = `
    SELECT
        to_timestamp(matches.date/1000)::date as day,
        SUM(matches.game_duration) as time,
        COALESCE(SUM(match_players.win), 0) as wins,
        COALESCE(SUM(match_players.loss), 0) as losses
    FROM
        match_players
        ${this.JOIN_MATCHES}
    WHERE
        match_players.summoner_puuid = :puuid
        AND to_timestamp(matches.date/1000)::date > (CURRENT_DATE - INTERVAL '105 days')
    GROUP BY
        day
    ORDER BY
        day
    `
    const { rows } = await Database.rawQuery(query, { puuid })
    console.timeEnd('RECENT_ACTIVITY')
    return rows
  }

  public async globalStats(filters: SelectFilters) {
    console.time('GLOBAL')
    const query = `
    SELECT
        COALESCE(SUM(match_players.kills), 0) as kills,
        COALESCE(SUM(match_players.deaths), 0) as deaths,
        COALESCE(SUM(match_players.assists), 0) as assists,
        COALESCE(SUM(match_players.minions), 0) as minions,
        COALESCE(SUM(matches.game_duration), 0) as time,
        COALESCE(SUM(match_players.vision_score), 0) as vision,
        COUNT(match_players.id) as count,
        COALESCE(AVG(match_players.kp), 0) as kp,
        COALESCE(SUM(match_players.win), 0) as wins,
        COALESCE(SUM(match_players.loss), 0) as losses
    FROM
        match_players
        ${this.JOIN_MATCHES}
    WHERE
        ${this.globalFilters(filters)}
    LIMIT
        1
    `

    const { rows } = await Database.rawQuery(query, filters as any)
    console.timeEnd('GLOBAL')
    return rows[0]
  }

  public async gamemodeStats(filters: SelectFilters) {
    console.time('GAMEMODE')
    const query = `
    SELECT
        matches.gamemode as id,
        COUNT(match_players.id) as count,
        SUM(match_players.win) as wins,
        SUM(match_players.loss) as losses
    FROM
        match_players
        ${this.JOIN_MATCHES}
    WHERE
        ${this.globalFilters(filters)}
    GROUP BY
        matches.gamemode
    ORDER BY
        count DESC
    `

    const { rows } = await Database.rawQuery(query, filters as any)
    console.timeEnd('GAMEMODE')
    return rows
  }

  public async roleStats(filters: SelectFilters) {
    console.time('ROLE')
    const query = `
    SELECT
        match_players.team_position as role,
        COUNT(match_players.id) as count,
        SUM(match_players.win) as wins,
        SUM(match_players.loss) as losses
    FROM
        match_players
        ${this.JOIN_MATCHES}
    WHERE
        ${this.globalFilters(filters)}
        AND match_players.team_position != 0
    GROUP BY
        role
    `

    const { rows } = await Database.rawQuery(query, filters as any)
    console.timeEnd('ROLE')
    return rows
  }

  public async championStats(filters: SelectFilters) {
    console.time('CHAMPION')
    const query = `
    SELECT
        match_players.champion_id as id,
        SUM(match_players.assists) as assists,
        SUM(match_players.deaths) as deaths,
        SUM(match_players.kills) as kills,
        COUNT(match_players.id) as count,
        SUM(match_players.win) as wins,
        SUM(match_players.loss) as losses
    FROM
        match_players
        ${this.JOIN_MATCHES}
    WHERE
        ${this.globalFilters(filters)}
    GROUP BY
        match_players.champion_id
    ORDER BY
        count DESC, match_players.champion_id
    LIMIT
      :limit
    `

    const { rows } = await Database.rawQuery(query, filters as any)
    console.timeEnd('CHAMPION')
    return rows
  }

  public async championClassStats(filters: SelectFilters) {
    console.time('CHAMPION-CLASS')
    const query = `
    SELECT
        match_players.champion_role as id,
        COUNT(match_players.id) as count,
        SUM(match_players.win) as wins,
        SUM(match_players.loss) as losses
    FROM
        match_players
        ${this.JOIN_MATCHES}
    WHERE
        ${this.globalFilters(filters)}
    GROUP BY
        match_players.champion_role
    ORDER BY
        count DESC
    `

    const { rows } = await Database.rawQuery(query, filters as any)
    console.timeEnd('CHAMPION-CLASS')
    return rows
  }

  public async mates(filters: SelectFilters) {
    console.time('MATES')
    const query = `
    SELECT
        (
        SELECT
            summoner_name
        FROM
            match_players
        WHERE
            summoner_puuid = mates.summoner_puuid
        ORDER BY
            match_id DESC
        LIMIT
            1
        ) AS name,
        COUNT(match_players.id) as count,
        SUM(match_players.win) as wins,
        SUM(match_players.loss) as losses
    FROM
        match_players
        ${this.JOIN_MATCHES}
    INNER JOIN
        match_players as mates ON match_players.match_id = mates.match_id AND match_players.team = mates.team
    WHERE
        ${this.globalFilters(filters)}
    GROUP BY
        mates.summoner_puuid
    ORDER BY
        count DESC, wins DESC
    LIMIT
        15
    `

    const { rows } = await Database.rawQuery(query, filters as any)
    console.timeEnd('MATES')

    // Remove the Summoner himself + unique game mates
    return rows.splice(1).filter((row) => row.count > 1)
  }

  public async championCompleteStats(puuid: string, queue?: number, season?: number) {
    const filters: SelectFilters = { puuid }
    if (queue) filters.queue = queue
    if (season) filters.season = season

    const query = `
    SELECT
        match_players.champion_id as id,
        SUM(match_players.assists) as assists,
        SUM(match_players.deaths) as deaths,
        SUM(match_players.kills) as kills,
        COUNT(match_players.id) as count,
        SUM(match_players.win) as wins,
        SUM(match_players.loss) as losses,
        AVG(matches.game_duration)::int as "gameLength",
        AVG(match_players.minions)::int as minions,
        AVG(match_players.gold)::int as gold,
        AVG(match_players.damage_dealt_champions)::int as "dmgChamp",
        AVG(match_players.damage_taken)::int as "dmgTaken",
        AVG(match_players.kp) as kp,
        MAX(matches.date) as date
    FROM
        match_players
        ${this.JOIN_MATCHES}
    WHERE
        ${this.globalFilters(filters)}
    GROUP BY
        match_players.champion_id
    ORDER BY
        count DESC, match_players.champion_id
    `

    const { rows } = await Database.rawQuery(query, filters as any)
    return rows
  }

  public async records(puuid: string, season?: number) {
    const filters: SelectFilters = { puuid }
    if (season) filters.season = season

    const fields = [
      'match_players.kills',
      'match_players.deaths',
      'match_players.assists',
      'match_players.gold',
      'matches.game_duration',
      'match_players.minions',
      'match_players.kda',
      'match_players.damage_taken',
      'match_players.damage_dealt_champions',
      'match_players.damage_dealt_objectives',
      'match_players.kp',
      'match_players.vision_score',
      'match_players.critical_strike',
      'match_players.time_spent_living',
      'match_players.heal',
      'match_players.turret_kills',
      'match_players.killing_spree',
      'match_players.double_kills',
      'match_players.triple_kills',
      'match_players.quadra_kills',
      'match_players.penta_kills',
    ]

    const query =
      `
    WITH base as (
        SELECT 
            ${fields.join()},
            match_players.win as result,
            matches.id,
            matches.date,
            matches.gamemode,
            match_players.champion_id
        FROM
            match_players
            ${this.JOIN_MATCHES}
        WHERE
            ${this.globalFilters(filters)}
    )
    ` +
      fields
        .map(
          (field) => `
      (SELECT
          '${field}' AS what,
          ${field.split('.').pop()} AS amount,
          result,
          id,
          date,
          gamemode,
          champion_id
      FROM
          base
      ORDER BY
          2 DESC, id
      LIMIT
          1)
      `
        )
        .join(' UNION ALL ')

    const { rows } = await Database.rawQuery(query, filters as any)
    return rows
  }
}

export default new MatchRepository()
