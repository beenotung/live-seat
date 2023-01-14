import { Knex } from "knex";


export async function up(knex: Knex): Promise<void> {

  if (!(await knex.schema.hasTable('booking'))) {
    await knex.schema.createTable('booking', table => {
      table.increments('id')
      table.text('row').notNullable()
      table.text('col').notNullable()
      table.timestamp('book_time').notNullable()
      table.timestamps(false, true)
    })
  }
}


export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('booking')
}
